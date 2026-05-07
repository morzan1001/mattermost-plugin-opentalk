package command

import "github.com/mattermost/mattermost/server/public/model"

const helpText = `**OpenTalk Plugin – Kommandos**
- ` + "`/opentalk connect`" + ` — verbinde dein Mattermost-Konto mit OpenTalk
- ` + "`/opentalk disconnect`" + ` — entferne die Verbindung
- ` + "`/opentalk info`" + ` — zeige aktuellen Verbindungsstatus
- ` + "`/opentalk start`" + ` — starte ein Meeting in diesem Channel
- ` + "`/opentalk join`" + ` — tritt einem laufenden Meeting bei
- ` + "`/opentalk end`" + ` — beendet das Meeting (nur für Host)
- ` + "`/opentalk dial-in`" + ` — zeigt SIP-Einwahldaten
- ` + "`/opentalk ring on|off`" + ` — Klingelton bei eingehenden Anrufen ein-/ausschalten
- ` + "`/opentalk help`" + ` — diese Hilfe`

func (h *Handler) help(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	return ephemeral(helpText), nil
}
