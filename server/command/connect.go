package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) connect(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)

	if _, err := h.Store.LoadUserInfo(h.EncryptionKey, args.UserId); err == nil {
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "Du bist bereits mit OpenTalk verbunden. /opentalk disconnect um die Verbindung aufzuheben.",
			EN: "You are already connected to OpenTalk. Use /opentalk disconnect to remove the connection.",
		})), nil
	} else if err != store.ErrNotFound {
		return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
			DE: "Status-Lookup fehlgeschlagen: %v",
			EN: "Status lookup failed: %v",
		}), err)), nil
	}
	url := fmt.Sprintf("%s/plugins/%s/oauth/start", h.SiteURL, h.PluginID)
	return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
		DE: "[Klicke hier, um dich mit OpenTalk zu verbinden](%s).",
		EN: "[Click here to connect your account to OpenTalk](%s).",
	}), url)), nil
}
