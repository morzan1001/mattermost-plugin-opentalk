package command

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) dialIn(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)

	am, err := h.Store.LoadActiveMeeting(args.ChannelId)
	if err == store.ErrNotFound {
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "In diesem Channel läuft kein aktives Meeting.",
			EN: "There is no active meeting in this channel.",
		})), nil
	}
	if err != nil {
		return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
			DE: "Lookup fehlgeschlagen: %v",
			EN: "Lookup failed: %v",
		}), err)), nil
	}
	if !am.EnableSIP {
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "Dieses Meeting hat kein SIP/Dial-In aktiviert.",
			EN: "This meeting does not have SIP/Dial-In enabled.",
		})), nil
	}
	return ephemeral(fmt.Sprintf("📞 Dial-in: %s · PIN %s", am.DialInNumber, am.DialInPIN)), nil
}
