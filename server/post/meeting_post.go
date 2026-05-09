// Package post owns the Mattermost-Post-Type used by the plugin to render
// in-channel meeting cards. The server constructs the post via the Bot user;
// the webapp registers a custom React component to render it. The same post
// also carries a Slack-style attachment so clients without a custom-post
// renderer (mattermost-mobile, ad-hoc viewers) get a usable card with a
// join link and action buttons.
package post

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// MeetingPostType is the Post.Type value the webapp registers a renderer for.
const MeetingPostType = "custom_opentalk_meeting"

// formatRelativeAge returns a short locale-aware "X ago" string for the given
// past time. Granularities: "just now" (< 60s), "Nm" (< 1h), "Nh" (< 24h),
// "Nd" (>= 24h). Negative or zero durations are clamped to "just now".
func formatRelativeAge(then time.Time, locale string) string {
	d := time.Since(then)
	if d < time.Minute {
		return i18n.T(locale, i18n.Translatable{
			DE: "gerade eben",
			EN: "just now",
		})
	}
	if d < time.Hour {
		mins := int(d / time.Minute)
		return i18n.T(locale, i18n.Translatable{
			DE: fmt.Sprintf("vor %d Min", mins),
			EN: fmt.Sprintf("%d min ago", mins),
		})
	}
	if d < 24*time.Hour {
		hrs := int(d / time.Hour)
		return i18n.T(locale, i18n.Translatable{
			DE: fmt.Sprintf("vor %d Std", hrs),
			EN: fmt.Sprintf("%d h ago", hrs),
		})
	}
	days := int(d / (24 * time.Hour))
	return i18n.T(locale, i18n.Translatable{
		DE: fmt.Sprintf("vor %d Tagen", days),
		EN: fmt.Sprintf("%d d ago", days),
	})
}

// formatDuration returns a short locale-neutral duration like "5m" or "1h 23m"
// from a positive seconds count.
func formatDuration(durationSeconds int64) string {
	if durationSeconds <= 0 {
		return ""
	}
	h := durationSeconds / 3600
	m := (durationSeconds % 3600) / 60
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	if m > 0 {
		return fmt.Sprintf("%dm", m)
	}
	return fmt.Sprintf("%ds", durationSeconds)
}

// PostActionPathEnd / PostActionPathDismiss are the relative plugin URLs the
// attachment action buttons POST to.
const (
	PostActionPathEnd     = "/plugins/com.github.morzan1001.mattermost-plugin-opentalk/api/v1/meetings/post-action/end"
	PostActionPathDismiss = "/plugins/com.github.morzan1001.mattermost-plugin-opentalk/api/v1/meetings/post-action/dismiss"
)

// BuildMeetingPost constructs the initial bot-authored post for a freshly
// created meeting. The Message field is plain text including the join URL —
// the universal fallback. props.attachments carries a richer Slack-style
// card for clients that render attachments (mattermost-mobile). The webapp
// suppresses the attachment via its custom-post renderer.
//
// isDM is true for direct or group channels; controls whether the "Decline"
// action is emitted on the attachment.
func BuildMeetingPost(am *store.ActiveMeeting, frontendURL, hostUsername, locale string, isDM bool) *model.Post {
	msg := i18n.T(locale, i18n.Translatable{
		DE: "OpenTalk-Meeting",
		EN: "OpenTalk meeting",
	})

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
	props["attachments"] = buildStartedAttachment(am, frontendURL, hostUsername, locale, isDM)

	return &model.Post{
		ChannelId: am.ChannelID,
		Message:   msg,
		Type:      MeetingPostType,
		Props:     props,
	}
}

// buildStartedAttachment builds the Slack-style attachment that ships with a
// freshly-created meeting post. Color blue, contains a markdown join link
// and dial-in line if SIP is enabled, plus an End-meeting action and an
// optional Decline action for DM/GM channels.
func buildStartedAttachment(am *store.ActiveMeeting, frontendURL, hostUsername, locale string, isDM bool) []*model.SlackAttachment {
	inviteURL := fmt.Sprintf("%s/invite/%s", frontendURL, am.InviteCode)
	startedAt := am.CreatedAt
	if startedAt.IsZero() {
		startedAt = time.Now().UTC()
	}

	title := i18n.T(locale, i18n.Translatable{
		DE: "OpenTalk-Meeting",
		EN: "OpenTalk meeting",
	})

	hostLine := i18n.T(locale, i18n.Translatable{
		DE: fmt.Sprintf("Host: %s", hostUsername),
		EN: fmt.Sprintf("Host: %s", hostUsername),
	})
	startedLine := i18n.T(locale, i18n.Translatable{
		DE: "Gestartet " + formatRelativeAge(startedAt, locale),
		EN: "Started " + formatRelativeAge(startedAt, locale),
	})
	joinLine := i18n.T(locale, i18n.Translatable{
		DE: fmt.Sprintf("**[Meeting beitreten](%s)**", inviteURL),
		EN: fmt.Sprintf("**[Join meeting](%s)**", inviteURL),
	})

	body := hostLine + "\n" + startedLine
	if am.EnableSIP && (am.DialInNumber != "" || am.DialInPIN != "") {
		dialLine := i18n.T(locale, i18n.Translatable{
			DE: fmt.Sprintf("Einwahl: %s · PIN %s", am.DialInNumber, am.DialInPIN),
			EN: fmt.Sprintf("Dial-in: %s · PIN %s", am.DialInNumber, am.DialInPIN),
		})
		body += "\n" + dialLine
	}
	// Extra blank line after the join link so the action buttons below are
	// visually separated and harder to mis-tap on mobile.
	body += "\n\n" + joinLine + "\n"

	endLabel := i18n.T(locale, i18n.Translatable{
		DE: "Meeting beenden",
		EN: "End meeting",
	})

	// Slack-attachment actions are not per-viewer. Every channel member sees
	// the End and Decline buttons; non-host taps are rejected server-side
	// with an ephemeral text by the post-action handlers.
	actions := []*model.PostAction{{
		Id:    "end",
		Name:  endLabel,
		Type:  model.PostActionTypeButton,
		Style: "danger",
		Integration: &model.PostActionIntegration{
			URL: PostActionPathEnd,
			Context: map[string]any{
				"channel_id": am.ChannelID,
				"room_id":    am.RoomID,
			},
		},
	}}
	if isDM {
		declineLabel := i18n.T(locale, i18n.Translatable{
			DE: "Ablehnen",
			EN: "Decline",
		})
		actions = append(actions, &model.PostAction{
			Id:   "dismiss",
			Name: declineLabel,
			Type: model.PostActionTypeButton,
			Integration: &model.PostActionIntegration{
				URL: PostActionPathDismiss,
				Context: map[string]any{
					"channel_id": am.ChannelID,
					"room_id":    am.RoomID,
				},
			},
		})
	}

	return []*model.SlackAttachment{{
		Title:   title,
		Text:    body,
		Color:   "#00B59C",
		Actions: actions,
	}}
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

	rebuildAttachmentForStatus(p, "ENDED", endedAt, duration)
}

// ApplyMissedStatus mutates the post in place to reflect a "missed" custom-
// post-status (DM call where all recipients declined or timed out).
func ApplyMissedStatus(p *model.Post, when time.Time) {
	if p.Props == nil {
		p.Props = model.StringInterface{}
	}
	p.AddProp("status", "MISSED")
	p.AddProp("ended_at", when.Unix())

	rebuildAttachmentForStatus(p, "MISSED", when, 0)
}

// rebuildAttachmentForStatus rewrites props.attachments to a status-appropriate
// shape. Reads host_username off the post props for the MISSED text. Locale
// is not preserved on the post — channel-locale at update time is unknown —
// so the rebuilt attachment renders in English. Acceptable degradation.
func rebuildAttachmentForStatus(p *model.Post, status string, when time.Time, durationSeconds int64) {
	hostUsername, _ := p.GetProp("host_username").(string)

	if status == "ENDED" {
		text := "Ended " + formatRelativeAge(when, "en") + "."
		if durationSeconds > 0 {
			text = fmt.Sprintf("Ended %s, duration %s.", formatRelativeAge(when, "en"), formatDuration(durationSeconds))
		}
		p.AddProp("attachments", []*model.SlackAttachment{{
			Title: "OpenTalk meeting (ended)",
			Text:  text,
			Color: "#9e9e9e",
		}})
		return
	}

	// MISSED.
	p.AddProp("attachments", []*model.SlackAttachment{{
		Title: "OpenTalk meeting (missed)",
		Text:  fmt.Sprintf("Missed call from %s.", hostUsername),
		Color: "#9e9e9e",
	}})
}
