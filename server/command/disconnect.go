package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
)

func (h *Handler) disconnect(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)

	if err := h.Store.DeleteUserInfo(args.UserId); err != nil {
		return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
			DE: "Verbindung konnte nicht entfernt werden: %v",
			EN: "Failed to remove connection: %v",
		}), err)), nil
	}
	h.API.PublishWebSocketEvent("user_connected_state",
		map[string]any{"mm_user_id": args.UserId, "connected": false},
		&model.WebsocketBroadcast{UserId: args.UserId})
	return ephemeral(i18n.T(locale, i18n.Translatable{
		DE: "Verbindung mit OpenTalk entfernt.",
		EN: "Connection to OpenTalk removed.",
	})), nil
}
