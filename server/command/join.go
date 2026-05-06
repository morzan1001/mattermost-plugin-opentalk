package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) join(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	am, err := h.Store.LoadActiveMeeting(args.ChannelId)
	if err == store.ErrNotFound {
		return ephemeral("In diesem Channel läuft kein aktives Meeting. /opentalk start zum Beginnen."), nil
	}
	if err != nil {
		return ephemeral(fmt.Sprintf("Lookup fehlgeschlagen: %v", err)), nil
	}
	url := fmt.Sprintf("%s/invite/%s", h.FrontendURL, am.InviteCode)
	return ephemeral(fmt.Sprintf("[Meeting beitreten](%s)", url)), nil
}
