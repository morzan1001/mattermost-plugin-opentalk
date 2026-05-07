package command

import (
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
)

// ring handles `/opentalk ring on|off|status` — a slash-command fallback for
// users on Mattermost versions that don't expose registerUserSettings (or
// where the OpenTalk Settings section just isn't visible). The actual
// preference lives in the webapp's localStorage; the command broadcasts a
// targeted WS event that the webapp catches and persists.
func (h *Handler) ring(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	fields := strings.Fields(args.Command)
	var sub string
	if len(fields) >= 3 {
		sub = strings.ToLower(fields[2])
	}

	switch sub {
	case "on", "an", "true", "1":
		if h.Broadcaster != nil {
			h.Broadcaster("ring_setting_changed", map[string]any{
				"mm_user_id": args.UserId,
				"enabled":    true,
			})
		}
		return ephemeral("Klingelton eingeschaltet."), nil

	case "off", "aus", "false", "0":
		if h.Broadcaster != nil {
			h.Broadcaster("ring_setting_changed", map[string]any{
				"mm_user_id": args.UserId,
				"enabled":    false,
			})
		}
		return ephemeral("Klingelton ausgeschaltet."), nil

	case "status", "":
		return ephemeral("Klingelton-Status: prüfe in den Mattermost-Einstellungen unter „OpenTalk", oder rufe `/opentalk ring on|off` auf, um umzuschalten."), nil

	default:
		return ephemeral("`/opentalk ring on|off|status` — schaltet den Klingelton bei eingehenden Anrufen ein/aus."), nil
	}
}
