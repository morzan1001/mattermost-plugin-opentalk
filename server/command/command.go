// Package command implements the /opentalk slash-command and its subcommands.
package command

import (
	"fmt"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/oidc"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

const Trigger = "opentalk"

// Handler bundles the dependencies needed by /opentalk subcommands.
type Handler struct {
	API           plugin.API
	Store         *store.Store
	OIDCClient    *oidc.Client
	EncryptionKey []byte
	SiteURL       string
	PluginID      string
	FrontendURL   string

	// MeetingCreator orchestrates room creation, invite generation, KV
	// persistence, and the bot-authored custom-post. Provided by the host
	// plugin so that /opentalk start re-uses the same pipeline as the HTTP
	// MeetingsCreate handler. Returns the persisted ActiveMeeting.
	MeetingCreator func(channelID, mmUserID string) (*store.ActiveMeeting, error)

	// PostGetter looks up an existing post by ID. Used by /opentalk end to
	// load the bot-authored meeting card so its status can be flipped.
	PostGetter func(postID string) (*model.Post, error)

	// PostUpdater persists a mutated post. Used by /opentalk end after
	// applying ENDED status to the meeting card.
	PostUpdater func(p *model.Post) error

	// Broadcaster publishes a plugin WebSocket event to all clients. Used by
	// /opentalk end to notify webapps that a meeting has ended.
	Broadcaster func(event string, payload map[string]any)

	// LocaleOf returns the MM locale string for a given user ID (e.g. "de",
	// "en-US"). Used by subcommands to select the correct i18n variant.
	// Returns "" on any error, which i18n.T treats as English.
	LocaleOf func(mmUserID string) string
}

// Execute dispatches the slash-command to the right subcommand.
func (h *Handler) Execute(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	fields := strings.Fields(args.Command)
	if len(fields) < 2 {
		return h.help(args)
	}
	sub := strings.ToLower(fields[1])
	switch sub {
	case "connect":
		return h.connect(args)
	case "disconnect":
		return h.disconnect(args)
	case "info":
		return h.info(args)
	case "start":
		return h.start(args)
	case "dial-in":
		return h.dialIn(args)
	case "end":
		return h.end(args)
	case "join":
		return h.join(args)
	case "ring":
		return h.ring(args)
	case "help":
		return h.help(args)
	default:
		locale := h.localeOf(args.UserId)
		return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
			DE: "Unbekannter Subcommand: %s. /opentalk help für Hilfe.",
			EN: "Unknown subcommand: %s. Use /opentalk help for help.",
		}), sub)), nil
	}
}

// localeOf is a nil-safe wrapper around h.LocaleOf. Returns "" (→ English)
// when LocaleOf is not wired or the user ID is empty.
func (h *Handler) localeOf(mmUserID string) string {
	if h.LocaleOf == nil || mmUserID == "" {
		return ""
	}
	return h.LocaleOf(mmUserID)
}

func ephemeral(msg string) *model.CommandResponse {
	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         msg,
	}
}
