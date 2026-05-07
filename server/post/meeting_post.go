// Package post owns the Mattermost-Post-Type used by the plugin to render
// in-channel meeting cards. The server constructs the post via the Bot user;
// the webapp registers a custom React component to render it.
package post

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// MeetingPostType is the Post.Type value the webapp registers a renderer for.
const MeetingPostType = "custom_opentalk_meeting"

// BuildMeetingPost constructs the initial bot-authored post for a freshly
// created meeting. The Message is plain text including the join URL so MM
// clients that don't render custom post types (e.g. MM-Mobile in phase 4)
// still see a usable link.
func BuildMeetingPost(am *store.ActiveMeeting, frontendURL, hostUsername string) *model.Post {
	inviteURL := fmt.Sprintf("%s/invite/%s", frontendURL, am.InviteCode)
	msg := fmt.Sprintf("📞 OpenTalk-Meeting gestartet — beitreten: %s", inviteURL)

	props := model.StringInterface{
		"room_id":       am.RoomID,
		"invite_code":   am.InviteCode,
		"host_user_id":  am.HostUserID,
		"host_username": hostUsername,
		"frontend_url":  frontendURL,
		"status":        "STARTED",
		"started_at":    am.CreatedAt.Unix(),
	}
	if am.EnableSIP {
		if am.DialInNumber != "" {
			props["dial_in_number"] = am.DialInNumber
		}
		if am.DialInPIN != "" {
			props["dial_in_pin"] = am.DialInPIN
		}
	}

	return &model.Post{
		ChannelId: am.ChannelID,
		Message:   msg,
		Type:      MeetingPostType,
		Props:     props,
	}
}

// ApplyEndedStatus mutates an existing meeting-post in place to mark the
// meeting as ended. The caller is responsible for calling pluginapi.Post.Update.
func ApplyEndedStatus(p *model.Post, endedAt time.Time) {
	startedAtRaw := p.GetProp("started_at")
	var duration int64
	switch v := startedAtRaw.(type) {
	case int64:
		duration = endedAt.Unix() - v
	case float64:
		duration = endedAt.Unix() - int64(v)
	}
	p.AddProp("status", "ENDED")
	p.AddProp("ended_at", endedAt.Unix())
	p.AddProp("duration_seconds", duration)
}

// ApplyMissedStatus mutates the post in place to reflect a "missed" custom-
// post-status (DM call where all recipients declined or timed out).
func ApplyMissedStatus(p *model.Post, when time.Time) {
	if p.Props == nil {
		p.Props = model.StringInterface{}
	}
	p.AddProp("status", "MISSED")
	p.AddProp("ended_at", when.Unix())
	// Don't include duration; MISSED implies no one joined.
}
