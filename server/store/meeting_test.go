package store

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testEncKey = []byte("0123456789abcdef0123456789abcdef")

func TestActiveMeeting_RoundTrip(t *testing.T) {
	api := &plugintest.API{}

	s := New(api)
	am := &ActiveMeeting{
		ChannelID:             "ch-1",
		RoomID:                "room-1",
		InviteCode:            "inv-1",
		HostUserID:            "host-uid",
		PostID:                "post-1",
		CreatedAt:             time.Date(2026, 5, 5, 18, 0, 0, 0, time.UTC),
		LastHeartbeat:         time.Date(2026, 5, 5, 18, 1, 0, 0, time.UTC),
		EnableSIP:             true,
		DialInNumber:          "+49 30 555 1234",
		DialInPIN:             "4242",
		HostHeartbeatReceived: true,
	}

	// Capture the bytes that SaveActiveMeeting writes, then re-feed them on KVGet.
	var written []byte
	api.On("KVSetWithExpiry", "meeting_ch-1", mock.AnythingOfType("[]uint8"), mock.AnythingOfType("int64")).
		Run(func(args mock.Arguments) { written = args.Get(1).([]byte) }).
		Return(nil)

	require.NoError(t, s.SaveActiveMeeting(testEncKey, am))

	api.On("KVGet", "meeting_ch-1").Return(written, nil)
	got, err := s.LoadActiveMeeting(testEncKey, "ch-1")
	require.NoError(t, err)
	assert.Equal(t, am.HostHeartbeatReceived, got.HostHeartbeatReceived,
		"HostHeartbeatReceived must round-trip through encryption + JSON")
	assert.NotContains(t, string(written), am.InviteCode,
		"invite_code must not be readable in plaintext from KV")
}

func TestActiveMeeting_LoadMissingReturnsNotFound(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", meetingKey("ch-x")).Return([]byte(nil), nil)

	s := New(api)
	_, err := s.LoadActiveMeeting(testEncKey, "ch-x")
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestActiveMeeting_Delete(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVDelete", meetingKey("ch-1")).Return(nil)

	s := New(api)
	require.NoError(t, s.DeleteActiveMeeting("ch-1"))
	api.AssertExpectations(t)
}
