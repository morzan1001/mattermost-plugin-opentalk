package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) start(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)

	if _, err := h.Store.LoadUserInfo(h.EncryptionKey, args.UserId); err != nil {
		if err == store.ErrNotFound {
			return ephemeral(i18n.T(locale, i18n.Translatable{
				DE: "Du bist nicht mit OpenTalk verbunden. /opentalk connect zum Starten.",
				EN: "You are not connected to OpenTalk. Use /opentalk connect to get started.",
			})), nil
		}
		return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
			DE: "Status-Lookup fehlgeschlagen: %v",
			EN: "Status lookup failed: %v",
		}), err)), nil
	}

	am, err := h.MeetingCreator(args.ChannelId, args.UserId)
	if err != nil {
		return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
			DE: "Meeting konnte nicht erstellt werden: %v",
			EN: "Failed to create meeting: %v",
		}), err)), nil
	}
	return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
		DE: "Meeting gestartet (Raum %s).",
		EN: "Meeting started (room %s).",
	}), am.RoomID)), nil
}
