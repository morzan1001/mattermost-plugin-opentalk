package post

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

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

	post := BuildMeetingPost(am, "https://opentalk.example", "alice", "", false)
	assert.Equal(t, MeetingPostType, post.Type)
	assert.Equal(t, "ch-1", post.ChannelId)
	assert.Equal(t, "OpenTalk meeting", post.Message)
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
	postDE := BuildMeetingPost(am, "https://o.example", "u", "de", false)
	assert.Equal(t, "OpenTalk-Meeting", postDE.Message)

	postEN := BuildMeetingPost(am, "https://o.example", "u", "en", false)
	assert.Equal(t, "OpenTalk meeting", postEN.Message)
}

func TestBuildMeetingPost_NoSIPLeavesDialInProps(t *testing.T) {
	am := &store.ActiveMeeting{
		ChannelID: "ch-1", RoomID: "r", InviteCode: "i",
		EnableSIP: false,
	}
	post := BuildMeetingPost(am, "https://o.example", "u", "", false)
	assert.Nil(t, post.GetProp("dial_in_number"))
	assert.Nil(t, post.GetProp("dial_in_pin"))
}

func TestApplyEndedStatus_UpdatesProps(t *testing.T) {
	p := BuildMeetingPost(&store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "r",
		InviteCode: "i",
		CreatedAt:  time.Now().Add(-15 * time.Minute),
	}, "https://o.example", "u", "", false)

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
	}, "https://o.example", "u", "", false)
	now := time.Now()
	ApplyMissedStatus(p, now)
	assert.Equal(t, "MISSED", p.GetProp("status"))
	assert.Equal(t, now.Unix(), p.GetProp("ended_at"))
}

// TestBuildMeetingPost_AttachmentSTARTED_Channel verifies that a non-DM
// meeting post carries one Slack attachment with the join markdown link,
// an "End meeting" action button, and NO "Decline" action.
func TestBuildMeetingPost_AttachmentSTARTED_Channel(t *testing.T) {
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

	post := BuildMeetingPost(am, "https://opentalk.example", "alice", "en", false)
	rawAtt := post.GetProp("attachments")
	require.NotNil(t, rawAtt, "post.props.attachments must be populated")

	atts, ok := rawAtt.([]*model.SlackAttachment)
	require.True(t, ok, "attachments must be []*model.SlackAttachment, got %T", rawAtt)
	require.Len(t, atts, 1)

	att := atts[0]
	assert.Equal(t, "#1e88e5", att.Color)
	assert.NotEmpty(t, att.Title)
	assert.Contains(t, att.Text, "https://opentalk.example/invite/inv-1",
		"attachment text must include the join URL as a markdown link")
	assert.Contains(t, att.Text, "[", "join URL must be wrapped in markdown link syntax")
	assert.Contains(t, att.Text, "+49 30 555 1234", "dial-in number must appear when EnableSIP")
	assert.Contains(t, att.Text, "4242", "dial-in PIN must appear when EnableSIP")

	require.Len(t, att.Actions, 1, "channel post: only End meeting button, no Decline")
	endAction := att.Actions[0]
	assert.Equal(t, "end", endAction.Id)
	assert.Equal(t, "button", endAction.Type)
	assert.NotNil(t, endAction.Integration)
	assert.Contains(t, endAction.Integration.URL, "/api/v1/meetings/post-action/end",
		"End button must point at the post-action endpoint")
	assert.Equal(t, "ch-1", endAction.Integration.Context["channel_id"])
}

func TestBuildMeetingPost_AttachmentSTARTED_DM(t *testing.T) {
	am := &store.ActiveMeeting{
		ChannelID:  "ch-dm",
		RoomID:     "room-dm",
		InviteCode: "inv-dm",
		HostUserID: "host-uid",
	}

	post := BuildMeetingPost(am, "https://opentalk.example", "alice", "en", true)
	rawAtt := post.GetProp("attachments")
	atts, ok := rawAtt.([]*model.SlackAttachment)
	require.True(t, ok)
	require.Len(t, atts, 1)

	att := atts[0]
	require.Len(t, att.Actions, 2, "DM post: End + Decline")
	assert.Equal(t, "end", att.Actions[0].Id)
	assert.Equal(t, "dismiss", att.Actions[1].Id)
	assert.Contains(t, att.Actions[1].Integration.URL, "/api/v1/meetings/post-action/dismiss")
}
