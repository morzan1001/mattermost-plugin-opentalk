package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"
)

func (h *Handler) disconnect(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	if err := h.Store.DeleteUserInfo(args.UserId); err != nil {
		return ephemeral(fmt.Sprintf("Verbindung konnte nicht entfernt werden: %v", err)), nil
	}
	h.API.PublishWebSocketEvent("user_connected_state",
		map[string]any{"mm_user_id": args.UserId, "connected": false},
		&model.WebsocketBroadcast{UserId: args.UserId})
	return ephemeral("Verbindung mit OpenTalk entfernt."), nil
}
