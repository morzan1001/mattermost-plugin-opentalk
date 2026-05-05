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
