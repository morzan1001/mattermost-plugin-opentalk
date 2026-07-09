package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
)

func (h *Handler) join(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)

	am, resp := h.requireActiveMeeting(args.ChannelId, locale, i18n.Translatable{
		DE: "In diesem Channel läuft kein aktives Meeting. /opentalk start zum Beginnen.",
		EN: "There is no active meeting in this channel. Use /opentalk start to begin one.",
	})
	if resp != nil {
		return resp, nil
	}
	url := fmt.Sprintf("%s/invite/%s", h.FrontendURL, am.InviteCode)
	return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
		DE: "[Meeting beitreten](%s)",
		EN: "[Join meeting](%s)",
	}), url)), nil
}
