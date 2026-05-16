package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/crypto"
)

// ErrMeetingAlreadyActive is returned by callers that detect a live meeting
// already persisted for a channel. The caller should treat the accompanying
// *ActiveMeeting return value as the existing meeting rather than creating a
// new one. Use errors.Is(err, store.ErrMeetingAlreadyActive) to branch.
var ErrMeetingAlreadyActive = errors.New("meeting already active in this channel")

// ActiveMeeting is per-channel state for a running OpenTalk meeting.
// Tokens are NOT stored here – ticket/resumption are short-lived and live
// only in the originating webapp tab. EnableSIP plus DialIn-Info are cached
// so the custom-post can show dial-in details without re-querying OpenTalk.
type ActiveMeeting struct {
	ChannelID     string    `json:"channel_id"`
	RoomID        string    `json:"room_id"`
	InviteCode    string    `json:"invite_code"`
	HostUserID    string    `json:"host_user_id"`
	PostID        string    `json:"post_id"`
	CreatedAt     time.Time `json:"created_at"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	EnableSIP     bool      `json:"enable_sip"`
	DialInNumber  string    `json:"dial_in_number,omitempty"`
	DialInPIN     string    `json:"dial_in_pin,omitempty"`

	// HostHeartbeatReceived flips to true the first time the host's webapp
	// reports a heartbeat against this meeting. Mobile-only hosts never set
	// it; the reaper grants them a longer initial grace before reaping.
	HostHeartbeatReceived bool `json:"host_heartbeat_received,omitempty"`
}

func meetingKey(channelID string) string {
	return "meeting_" + channelID
}

// decodeActiveMeeting unwraps an at-rest value: it tries AES-GCM first and
// falls back to plaintext JSON so values written before encryption was added
// can still be read until the next save re-encrypts them.
func decodeActiveMeeting(encKey, raw []byte) (*ActiveMeeting, error) {
	if plain, dErr := crypto.Decrypt(encKey, raw); dErr == nil {
		raw = plain
	}
	var am ActiveMeeting
	if err := json.Unmarshal(raw, &am); err != nil {
		return nil, fmt.Errorf("unmarshal ActiveMeeting: %w", err)
	}
	return &am, nil
}

func encodeActiveMeeting(encKey []byte, am *ActiveMeeting) ([]byte, error) {
	raw, err := json.Marshal(am)
	if err != nil {
		return nil, fmt.Errorf("marshal ActiveMeeting: %w", err)
	}
	return crypto.Encrypt(encKey, raw)
}

func (s *Store) SaveActiveMeeting(encKey []byte, am *ActiveMeeting) error {
	value, err := encodeActiveMeeting(encKey, am)
	if err != nil {
		return err
	}
	return s.Set(meetingKey(am.ChannelID), value, 0)
}

// CreateActiveMeetingAtomic persists am only if no meeting exists for the
// same channel. Returns ErrMeetingAlreadyActive when another node won the
// race. The Mattermost KV CAS guarantees this even across cluster nodes.
func (s *Store) CreateActiveMeetingAtomic(encKey []byte, am *ActiveMeeting) error {
	value, err := encodeActiveMeeting(encKey, am)
	if err != nil {
		return err
	}
	ok, appErr := s.api.KVSetWithOptions(meetingKey(am.ChannelID), value, model.PluginKVSetOptions{
		Atomic:   true,
		OldValue: nil,
	})
	if appErr != nil {
		return appErr
	}
	if !ok {
		return ErrMeetingAlreadyActive
	}
	return nil
}

func (s *Store) LoadActiveMeeting(encKey []byte, channelID string) (*ActiveMeeting, error) {
	raw, err := s.Get(meetingKey(channelID))
	if err != nil {
		return nil, err
	}
	return decodeActiveMeeting(encKey, raw)
}

func (s *Store) DeleteActiveMeeting(channelID string) error {
	return s.Delete(meetingKey(channelID))
}

// ListActiveMeetings enumerates every meeting_<channelID> KV entry by
// paging through KVList. Used by the reaper to find stale heartbeats.
// Returns nil + nil on empty, partial result + nil on per-key parse
// errors (best-effort).
func (s *Store) ListActiveMeetings(encKey []byte) ([]*ActiveMeeting, error) {
	out := make([]*ActiveMeeting, 0, 8)
	page := 0
	const perPage = 200
	for {
		keys, appErr := s.api.KVList(page, perPage)
		if appErr != nil {
			return out, appErr
		}
		if len(keys) == 0 {
			break
		}
		for _, k := range keys {
			if !strings.HasPrefix(k, "meeting_") {
				continue
			}
			raw, err := s.Get(k)
			if err != nil {
				continue
			}
			am, dErr := decodeActiveMeeting(encKey, raw)
			if dErr != nil {
				continue
			}
			out = append(out, am)
		}
		if len(keys) < perPage {
			break
		}
		page++
	}
	return out, nil
}

func dismissalKey(channelID, roomID string) string {
	return "dismiss_" + channelID + "_" + roomID
}

// AddDismissal records that mmUserID has dismissed the call in (channelID, roomID).
// Returns the full updated set of dismissing user-IDs.
func (s *Store) AddDismissal(channelID, roomID, mmUserID string) ([]string, error) {
	set, _ := s.LoadDismissals(channelID, roomID)
	seen := make(map[string]bool, len(set))
	for _, u := range set {
		seen[u] = true
	}
	if !seen[mmUserID] {
		set = append(set, mmUserID)
	}
	raw, err := json.Marshal(set)
	if err != nil {
		return nil, err
	}
	// 1h TTL — keep the set well past the call's lifetime to avoid races.
	if err := s.Set(dismissalKey(channelID, roomID), raw, int64((1 * time.Hour).Seconds())); err != nil {
		return nil, err
	}
	return set, nil
}

// LoadDismissals returns the set of user-IDs that have dismissed the call
// in (channelID, roomID). Returns nil, nil when no dismissals have been recorded.
func (s *Store) LoadDismissals(channelID, roomID string) ([]string, error) {
	raw, err := s.Get(dismissalKey(channelID, roomID))
	if err != nil {
		if err == ErrNotFound {
			return nil, nil
		}
		return nil, err
	}
	var set []string
	if err := json.Unmarshal(raw, &set); err != nil {
		return nil, err
	}
	return set, nil
}

// DeleteDismissals removes the dismissal set for (channelID, roomID).
func (s *Store) DeleteDismissals(channelID, roomID string) error {
	return s.Delete(dismissalKey(channelID, roomID))
}
