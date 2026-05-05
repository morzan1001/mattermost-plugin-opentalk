package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) connect(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	if _, err := h.Store.LoadUserInfo(h.EncryptionKey, args.UserId); err == nil {
		return ephemeral("Du bist bereits mit OpenTalk verbunden. /opentalk disconnect um die Verbindung aufzuheben."), nil
	} else if err != store.ErrNotFound {
		return ephemeral(fmt.Sprintf("Status-Lookup fehlgeschlagen: %v", err)), nil
	}
	url := fmt.Sprintf("%s/plugins/%s/oauth/start", h.SiteURL, h.PluginID)
	return ephemeral(fmt.Sprintf("[Klicke hier, um dich mit OpenTalk zu verbinden](%s).", url)), nil
}
