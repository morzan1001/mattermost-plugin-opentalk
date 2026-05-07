package command

import (
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
)

func (h *Handler) help(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)
	return ephemeral(buildHelp(locale)), nil
}

func buildHelp(locale string) string {
	return i18n.T(locale, i18n.Translatable{
		DE: `**OpenTalk Plugin – Kommandos**
- ` + "`/opentalk connect`" + ` — verbinde dein Mattermost-Konto mit OpenTalk
- ` + "`/opentalk disconnect`" + ` — entferne die Verbindung
- ` + "`/opentalk info`" + ` — zeige aktuellen Verbindungsstatus
- ` + "`/opentalk start`" + ` — starte ein Meeting in diesem Channel
- ` + "`/opentalk join`" + ` — tritt einem laufenden Meeting bei
- ` + "`/opentalk end`" + ` — beendet das Meeting (nur für Host)
- ` + "`/opentalk dial-in`" + ` — zeigt SIP-Einwahldaten
- ` + "`/opentalk ring on|off`" + ` — Klingelton bei eingehenden Anrufen ein-/ausschalten
- ` + "`/opentalk help`" + ` — diese Hilfe`,
		EN: `**OpenTalk Plugin – commands**
- ` + "`/opentalk connect`" + ` — link your Mattermost account to OpenTalk
- ` + "`/opentalk disconnect`" + ` — remove the link
- ` + "`/opentalk info`" + ` — show current connection status
- ` + "`/opentalk start`" + ` — start a meeting in this channel
- ` + "`/opentalk join`" + ` — join an active meeting
- ` + "`/opentalk end`" + ` — end the meeting (host only)
- ` + "`/opentalk dial-in`" + ` — show SIP dial-in details
- ` + "`/opentalk ring on|off`" + ` — toggle ringtone for incoming calls
- ` + "`/opentalk help`" + ` — this help`,
	})
}
