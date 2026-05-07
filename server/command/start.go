package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) start(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	if _, err := h.Store.LoadUserInfo(h.EncryptionKey, args.UserId); err != nil {
		if err == store.ErrNotFound {
			return ephemeral("Du bist nicht mit OpenTalk verbunden. /opentalk connect zum Starten."), nil
		}
		return ephemeral(fmt.Sprintf("Status-Lookup fehlgeschlagen: %v", err)), nil
	}

	am, err := h.MeetingCreator(args.ChannelId, args.UserId)
	if err != nil {
		return ephemeral(fmt.Sprintf("Meeting konnte nicht erstellt werden: %v", err)), nil
	}
	return ephemeral(fmt.Sprintf("Meeting gestartet (Raum %s).", am.RoomID)), nil
}
