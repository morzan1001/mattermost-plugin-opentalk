package command

import "github.com/mattermost/mattermost/server/public/model"

func AutocompleteData() *model.AutocompleteData {
	root := model.NewAutocompleteData(Trigger, "[connect|disconnect|info|help]", "OpenTalk plugin commands")
	root.AddCommand(model.NewAutocompleteData("connect", "", "Verbinde dein OpenTalk-Konto"))
	root.AddCommand(model.NewAutocompleteData("disconnect", "", "Entferne die OpenTalk-Verbindung"))
	root.AddCommand(model.NewAutocompleteData("info", "", "Zeige Verbindungsstatus"))
	root.AddCommand(model.NewAutocompleteData("help", "", "Hilfe zu /opentalk"))
	return root
}
