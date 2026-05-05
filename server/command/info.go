package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) info(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	info, err := h.Store.LoadUserInfo(h.EncryptionKey, args.UserId)
	if err == store.ErrNotFound {
		return ephemeral("Du bist nicht mit OpenTalk verbunden. /opentalk connect zum Starten."), nil
	}
	if err != nil {
		return ephemeral(fmt.Sprintf("Status-Lookup fehlgeschlagen: %v", err)), nil
	}
	return ephemeral(fmt.Sprintf("Verbunden als **%s** (sub: %s) seit %s",
		info.OpenTalkEmail, info.OpenTalkSub, info.ConnectedAt.Format("2006-01-02 15:04 MST"))), nil
}
