// Package command implements the /opentalk slash-command and its subcommands.
package command

import (
	"fmt"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/opentalk/mattermost-plugin-opentalk/server/oidc"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
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
	case "help":
		return h.help(args)
	default:
		return ephemeral(fmt.Sprintf("Unbekannter Subcommand: %s. /opentalk help für Hilfe.", sub)), nil
	}
}

func ephemeral(msg string) *model.CommandResponse {
	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         msg,
	}
}
