package store

import (
	"encoding/json"
	"fmt"
	"time"
)

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
}

func meetingKey(channelID string) string {
	return "meeting_" + channelID
}

func (s *Store) SaveActiveMeeting(am *ActiveMeeting) error {
	raw, err := json.Marshal(am)
	if err != nil {
		return fmt.Errorf("marshal ActiveMeeting: %w", err)
	}
	return s.Set(meetingKey(am.ChannelID), raw, 0)
}

func (s *Store) LoadActiveMeeting(channelID string) (*ActiveMeeting, error) {
	raw, err := s.Get(meetingKey(channelID))
	if err != nil {
		return nil, err
	}
	var am ActiveMeeting
	if err := json.Unmarshal(raw, &am); err != nil {
		return nil, fmt.Errorf("unmarshal ActiveMeeting: %w", err)
	}
	return &am, nil
}

func (s *Store) DeleteActiveMeeting(channelID string) error {
	return s.Delete(meetingKey(channelID))
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
	if err := s.Set(dismissalKey(channelID, roomID), raw, int64((1*time.Hour).Seconds())); err != nil {
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
