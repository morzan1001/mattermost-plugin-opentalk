package reaper

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

// meetingBytes serialises an ActiveMeeting to JSON as stored by store.Store.
func meetingBytes(t *testing.T, am *store.ActiveMeeting) []byte {
	t.Helper()
	b, err := json.Marshal(am)
	require.NoError(t, err)
	return b
}

// meetingKVKey returns the KV key for a channel meeting, mirroring
// store.meetingKey (unexported in the store package).
func meetingKVKey(channelID string) string {
	return "meeting_" + channelID
}

// setupAPIWithMeetings wires a plugintest.API to return the given meetings
// from KVList + KVGet, simulating how store.Store.ListActiveMeetings works.
// Non-meeting keys returned by KVList are ignored by the store.
func setupAPIWithMeetings(t *testing.T, meetings []*store.ActiveMeeting) *plugintest.API {
	t.Helper()
	api := &plugintest.API{}

	// KVList page 0: return meeting keys + an empty page sentinel.
	keys := make([]string, 0, len(meetings))
	for _, am := range meetings {
		keys = append(keys, meetingKVKey(am.ChannelID))
	}
	// First KVList call → keys; second call (page 1) → empty to stop iteration.
	api.On("KVList", 0, 200).Return(keys, nil).Once()
	api.On("KVList", 1, 200).Return([]string{}, nil).Maybe()

	// KVGet for each meeting key.
	for _, am := range meetings {
		am := am // capture loop var
		api.On("KVGet", meetingKVKey(am.ChannelID)).Return(meetingBytes(t, am), nil)
	}

	return api
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestRunOnce_EmptyStore verifies that when ListActiveMeetings returns an empty
// list, RunOnce does nothing (no call to the end callback).
func TestRunOnce_EmptyStore(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVList", 0, 200).Return([]string{}, nil)

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	assert.Empty(t, ended, "empty store: no meetings should be ended")
}

// TestRunOnce_FreshMeeting_NotEnded verifies that a meeting whose LastHeartbeat
// is recent (within the staleness window) is NOT passed to the end callback.
func TestRunOnce_FreshMeeting_NotEnded(t *testing.T) {
	fresh := &store.ActiveMeeting{
		ChannelID:             "ch-fresh",
		RoomID:                "room-fresh",
		LastHeartbeat:         time.Now().UTC(), // just now → fresh
		HostHeartbeatReceived: true,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{fresh})

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	assert.Empty(t, ended, "fresh meeting should not be ended")
}

// TestRunOnce_StaleMeeting_Ended verifies that a meeting whose LastHeartbeat
// is older than the staleness threshold IS passed to the end callback.
func TestRunOnce_StaleMeeting_Ended(t *testing.T) {
	stale := &store.ActiveMeeting{
		ChannelID:             "ch-stale",
		RoomID:                "room-stale",
		LastHeartbeat:         time.Now().UTC().Add(-10 * time.Minute), // 10 min ago
		HostHeartbeatReceived: true,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{stale})
	api.On("LogInfo",
		mock.AnythingOfType("string"),
		mock.Anything, mock.Anything,
		mock.Anything, mock.Anything,
		mock.Anything, mock.Anything,
	).Return()

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute) // staleness = 5 min

	r.RunOnce()

	require.Len(t, ended, 1)
	assert.Equal(t, "ch-stale", ended[0].ChannelID)
}

// TestRunOnce_MixedMeetings_OnlyStaleEnded verifies the mixed case: given one
// fresh and one stale meeting, only the stale one is ended.
func TestRunOnce_MixedMeetings_OnlyStaleEnded(t *testing.T) {
	now := time.Now().UTC()
	fresh := &store.ActiveMeeting{
		ChannelID:             "ch-1",
		RoomID:                "room-1",
		LastHeartbeat:         now, // just now
		HostHeartbeatReceived: true,
	}
	stale := &store.ActiveMeeting{
		ChannelID:             "ch-2",
		RoomID:                "room-2",
		LastHeartbeat:         now.Add(-20 * time.Minute), // 20 min ago
		HostHeartbeatReceived: true,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{fresh, stale})
	api.On("LogInfo",
		mock.AnythingOfType("string"),
		mock.Anything, mock.Anything,
		mock.Anything, mock.Anything,
		mock.Anything, mock.Anything,
	).Return()

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	require.Len(t, ended, 1, "only the stale meeting should be ended")
	assert.Equal(t, "ch-2", ended[0].ChannelID)
}

// TestRunOnce_ListActiveMeetingsError_LogsWarnDoesNotPanic verifies that when
// the store's ListActiveMeetings returns an error (KVList fails), RunOnce logs
// a warning via API.LogWarn and does not panic or call the end callback.
func TestRunOnce_ListActiveMeetingsError_LogsWarnDoesNotPanic(t *testing.T) {
	api := &plugintest.API{}
	// Make KVList return an AppError.
	api.On("KVList", 0, 200).Return(
		[]string(nil),
		&model.AppError{Message: "kv list failed"},
	)
	api.On("LogWarn",
		mock.AnythingOfType("string"),
		mock.Anything, mock.Anything,
	).Return()

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	assert.NotPanics(t, func() { r.RunOnce() })
	assert.Empty(t, ended)
	api.AssertCalled(t, "LogWarn", mock.AnythingOfType("string"), mock.Anything, mock.Anything)
}

// TestStartStop_Idempotent verifies that calling Start() twice and Stop() twice
// does not panic and that the mutex state is consistent.
func TestStartStop_Idempotent(t *testing.T) {
	api := &plugintest.API{}
	// The goroutine started by Start() calls tick() immediately; that calls
	// KVList. Allow it, but it may or may not fire before Stop() — hence Maybe().
	api.On("KVList", 0, 200).Return([]string{}, nil).Maybe()

	s := store.New(api)
	r := New(api, s, func(*store.ActiveMeeting) {},
		50*time.Millisecond, 5*time.Minute)

	// Double Start — second call must be a no-op, not a panic or double launch.
	assert.NotPanics(t, func() {
		r.Start()
		r.Start()
	})

	// Give the goroutine a moment to settle.
	time.Sleep(10 * time.Millisecond)

	// Double Stop — second call must be a no-op.
	assert.NotPanics(t, func() {
		r.Stop()
		r.Stop()
	})
}

// TestStartStop_ConcurrentSafe exercises Start/Stop under the race detector.
// Run with: go test -race ./server/reaper/...
func TestStartStop_ConcurrentSafe(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVList", 0, 200).Return([]string{}, nil).Maybe()

	s := store.New(api)
	r := New(api, s, func(*store.ActiveMeeting) {},
		50*time.Millisecond, 5*time.Minute)

	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r.Start()
			time.Sleep(5 * time.Millisecond)
			r.Stop()
		}()
	}
	wg.Wait()
}

// TestRunOnce_PreHeartbeat_StaleByOldRule_KeptByGrace covers the case where
// no webapp heartbeat has been received yet and the meeting's LastHeartbeat
// is already older than the existing 5-min staleness window — but CreatedAt
// is younger than the new 30-min grace window. The grace branch must keep it.
func TestRunOnce_PreHeartbeat_StaleByOldRule_KeptByGrace(t *testing.T) {
	now := time.Now().UTC()
	young := &store.ActiveMeeting{
		ChannelID:             "ch-grace",
		RoomID:                "room-grace",
		CreatedAt:             now.Add(-10 * time.Minute),
		LastHeartbeat:         now.Add(-10 * time.Minute),
		HostHeartbeatReceived: false,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{young})

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	assert.Empty(t, ended,
		"pre-heartbeat meeting under the 30-min grace must not be ended even though LastHeartbeat is older than the 5-min staleness")
}

// TestRunOnce_PreHeartbeat_OldEnough_Ended covers the case where no webapp
// heartbeat has been received and the meeting is older than the pre-heartbeat
// grace window — must be ended.
func TestRunOnce_PreHeartbeat_OldEnough_Ended(t *testing.T) {
	stale := &store.ActiveMeeting{
		ChannelID:             "ch-old",
		RoomID:                "room-old",
		CreatedAt:             time.Now().UTC().Add(-31 * time.Minute), // older than 30m grace
		LastHeartbeat:         time.Now().UTC().Add(-31 * time.Minute),
		HostHeartbeatReceived: false,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{stale})
	api.On("LogInfo",
		mock.AnythingOfType("string"),
		mock.Anything, mock.Anything,
		mock.Anything, mock.Anything,
		mock.Anything, mock.Anything,
	).Return()

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	require.Len(t, ended, 1)
	assert.Equal(t, "ch-old", ended[0].ChannelID)
}

// TestRunOnce_PostHeartbeat_FreshHeartbeat_NotEnded covers a meeting where
// the webapp has heartbeat at least once and the heartbeat is recent — the
// existing 5-minute staleness path must keep it alive even if CreatedAt is old.
func TestRunOnce_PostHeartbeat_FreshHeartbeat_NotEnded(t *testing.T) {
	old := &store.ActiveMeeting{
		ChannelID:             "ch-active",
		RoomID:                "room-active",
		CreatedAt:             time.Now().UTC().Add(-2 * time.Hour), // very old
		LastHeartbeat:         time.Now().UTC(),                     // beat just now
		HostHeartbeatReceived: true,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{old})

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	assert.Empty(t, ended, "actively-heartbeating meeting must not be ended")
}
