package command

import (
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
)

// AutocompleteData builds the /opentalk autocomplete tree. Mattermost registers
// autocomplete once and globally (not per user), so the labels are rendered in
// the given locale -- pass the server default locale.
func AutocompleteData(locale string) *model.AutocompleteData {
	t := func(de, en string) string {
		return i18n.T(locale, i18n.Translatable{DE: de, EN: en})
	}
	root := model.NewAutocompleteData(Trigger, "[connect|disconnect|info|start|dial-in|end|join|ring|help]", t("OpenTalk-Plugin-Befehle", "OpenTalk plugin commands"))
	root.AddCommand(model.NewAutocompleteData("connect", "", t("Verbinde dein OpenTalk-Konto", "Link your OpenTalk account")))
	root.AddCommand(model.NewAutocompleteData("disconnect", "", t("Entferne die OpenTalk-Verbindung", "Unlink your OpenTalk account")))
	root.AddCommand(model.NewAutocompleteData("info", "", t("Zeige Verbindungsstatus", "Show connection status")))
	root.AddCommand(model.NewAutocompleteData("start", "", t("Starte ein OpenTalk-Meeting im aktuellen Channel", "Start an OpenTalk meeting in this channel")))
	root.AddCommand(model.NewAutocompleteData("dial-in", "", t("Zeige SIP-Dial-In-Info des aktiven Meetings", "Show the SIP dial-in info for the active meeting")))
	root.AddCommand(model.NewAutocompleteData("end", "", t("Beende das aktive Meeting (nur Host)", "End the active meeting (host only)")))
	root.AddCommand(model.NewAutocompleteData("join", "", t("Tritt dem aktiven Meeting bei (öffnet OpenTalk im neuen Tab)", "Join the active meeting (opens OpenTalk in a new tab)")))
	root.AddCommand(model.NewAutocompleteData("ring", "[on|off|status]", t("Klingelton bei eingehenden Anrufen ein-/ausschalten", "Toggle the ringtone for incoming calls")))
	root.AddCommand(model.NewAutocompleteData("help", "", t("Hilfe zu /opentalk", "Help for /opentalk")))
	return root
}
