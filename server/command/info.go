package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) info(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)

	info, err := h.Store.LoadUserInfo(h.EncryptionKey, args.UserId)
	if err == store.ErrNotFound {
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "Du bist nicht mit OpenTalk verbunden. /opentalk connect zum Starten.",
			EN: "You are not connected to OpenTalk. Use /opentalk connect to get started.",
		})), nil
	}
	if err != nil {
		return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
			DE: "Status-Lookup fehlgeschlagen: %v",
			EN: "Status lookup failed: %v",
		}), err)), nil
	}
	return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
		DE: "Verbunden als **%s** (sub: %s) seit %s",
		EN: "Connected as **%s** (sub: %s) since %s",
	}), info.OpenTalkEmail, info.OpenTalkSub, info.ConnectedAt.Format("2006-01-02 15:04 MST"))), nil
}
