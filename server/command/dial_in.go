package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
)

func (h *Handler) dialIn(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)

	am, resp := h.requireActiveMeeting(args.ChannelId, locale, i18n.Translatable{
		DE: "In diesem Channel läuft kein aktives Meeting.",
		EN: "There is no active meeting in this channel.",
	})
	if resp != nil {
		return resp, nil
	}
	if !am.EnableSIP {
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "Dieses Meeting hat kein SIP/Dial-In aktiviert.",
			EN: "This meeting does not have SIP/Dial-In enabled.",
		})), nil
	}
	return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
		DE: "Einwahl: %s · PIN %s",
		EN: "Dial-in: %s · PIN %s",
	}), am.DialInNumber, am.DialInPIN)), nil
}
