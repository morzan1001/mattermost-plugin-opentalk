package command

import "github.com/mattermost/mattermost/server/public/model"

func AutocompleteData() *model.AutocompleteData {
	root := model.NewAutocompleteData(Trigger, "[connect|disconnect|info|start|dial-in|end|join|help]", "OpenTalk plugin commands")
	root.AddCommand(model.NewAutocompleteData("connect", "", "Verbinde dein OpenTalk-Konto"))
	root.AddCommand(model.NewAutocompleteData("disconnect", "", "Entferne die OpenTalk-Verbindung"))
	root.AddCommand(model.NewAutocompleteData("info", "", "Zeige Verbindungsstatus"))
	root.AddCommand(model.NewAutocompleteData("start", "", "Starte ein OpenTalk-Meeting im aktuellen Channel"))
	root.AddCommand(model.NewAutocompleteData("dial-in", "", "Zeige SIP-Dial-In-Info des aktiven Meetings"))
	root.AddCommand(model.NewAutocompleteData("end", "", "Beende das aktive Meeting (nur Host)"))
	root.AddCommand(model.NewAutocompleteData("join", "", "Tritt dem aktiven Meeting bei (öffnet OpenTalk im neuen Tab)"))
	root.AddCommand(model.NewAutocompleteData("ring", "[on|off|status]", "Klingelton bei eingehenden Anrufen ein-/ausschalten"))
	root.AddCommand(model.NewAutocompleteData("help", "", "Hilfe zu /opentalk"))
	return root
}
