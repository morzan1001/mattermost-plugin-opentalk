package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) dialIn(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	am, err := h.Store.LoadActiveMeeting(args.ChannelId)
	if err == store.ErrNotFound {
		return ephemeral("In diesem Channel läuft kein aktives Meeting."), nil
	}
	if err != nil {
		return ephemeral(fmt.Sprintf("Lookup fehlgeschlagen: %v", err)), nil
	}
	if !am.EnableSIP {
		return ephemeral("Dieses Meeting hat kein SIP/Dial-In aktiviert."), nil
	}
	return ephemeral(fmt.Sprintf("📞 Dial-in: %s · PIN %s", am.DialInNumber, am.DialInPIN)), nil
}
