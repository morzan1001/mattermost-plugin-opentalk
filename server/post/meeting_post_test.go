package post

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func TestBuildMeetingPost_Initial(t *testing.T) {
	am := &store.ActiveMeeting{
		ChannelID:    "ch-1",
		RoomID:       "room-1",
		InviteCode:   "inv-1",
		HostUserID:   "host-uid",
		CreatedAt:    time.Date(2026, 5, 5, 18, 0, 0, 0, time.UTC),
		EnableSIP:    true,
		DialInNumber: "+49 30 555 1234",
		DialInPIN:    "4242",
	}

	post := BuildMeetingPost(am, "https://opentalk.example", "alice", "")
	assert.Equal(t, MeetingPostType, post.Type)
	assert.Equal(t, "ch-1", post.ChannelId)
	assert.Contains(t, post.Message, "https://opentalk.example/invite/inv-1")
	assert.Equal(t, "room-1", post.GetProp("room_id"))
	assert.Equal(t, "inv-1", post.GetProp("invite_code"))
	assert.Equal(t, "host-uid", post.GetProp("host_user_id"))
	assert.Equal(t, "alice", post.GetProp("host_username"))
	assert.Equal(t, "https://opentalk.example", post.GetProp("frontend_url"))
	assert.Equal(t, "+49 30 555 1234", post.GetProp("dial_in_number"))
	assert.Equal(t, "4242", post.GetProp("dial_in_pin"))
	assert.Equal(t, "STARTED", post.GetProp("status"))
}

func TestBuildMeetingPost_LocaleDE(t *testing.T) {
	am := &store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "r",
		InviteCode: "i",
	}
	postDE := BuildMeetingPost(am, "https://o.example", "u", "de")
	assert.Contains(t, postDE.Message, "gestartet")

	postEN := BuildMeetingPost(am, "https://o.example", "u", "en")
	assert.Contains(t, postEN.Message, "started")
}

func TestBuildMeetingPost_NoSIPLeavesDialInProps(t *testing.T) {
	am := &store.ActiveMeeting{
		ChannelID: "ch-1", RoomID: "r", InviteCode: "i",
		EnableSIP: false,
	}
	post := BuildMeetingPost(am, "https://o.example", "u", "")
	assert.Nil(t, post.GetProp("dial_in_number"))
	assert.Nil(t, post.GetProp("dial_in_pin"))
}

func TestApplyEndedStatus_UpdatesProps(t *testing.T) {
	p := BuildMeetingPost(&store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "r",
		InviteCode: "i",
		CreatedAt:  time.Now().Add(-15 * time.Minute),
	}, "https://o.example", "u", "")

	ApplyEndedStatus(p, time.Now())
	assert.Equal(t, "ENDED", p.GetProp("status"))
	assert.NotNil(t, p.GetProp("ended_at"))
	assert.NotNil(t, p.GetProp("duration_seconds"))
}

func TestApplyMissedStatus_SetsStatus(t *testing.T) {
	p := BuildMeetingPost(&store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "r",
		InviteCode: "i",
	}, "https://o.example", "u", "")
	now := time.Now()
	ApplyMissedStatus(p, now)
	assert.Equal(t, "MISSED", p.GetProp("status"))
	assert.Equal(t, now.Unix(), p.GetProp("ended_at"))
}
