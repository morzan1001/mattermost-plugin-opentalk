package command

import (
	"strings"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
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

	locale := h.localeOf(args.UserId)

	switch sub {
	case "on", "an", "true", "1":
		if h.Broadcaster != nil {
			h.Broadcaster("ring_setting_changed", map[string]any{
				"mm_user_id": args.UserId,
				"enabled":    true,
			})
		}
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "Klingelton eingeschaltet.",
			EN: "Ringtone enabled.",
		})), nil

	case "off", "aus", "false", "0":
		if h.Broadcaster != nil {
			h.Broadcaster("ring_setting_changed", map[string]any{
				"mm_user_id": args.UserId,
				"enabled":    false,
			})
		}
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "Klingelton ausgeschaltet.",
			EN: "Ringtone disabled.",
		})), nil

	case "status", "":
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "Klingelton-Status: prüfe in den Mattermost-Einstellungen unter „OpenTalk", oder rufe `/opentalk ring on|off` auf, um umzuschalten.",
			EN: "Ringtone status: check Mattermost settings under \"OpenTalk\", or use `/opentalk ring on|off` to toggle.",
		})), nil

	default:
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "`/opentalk ring on|off|status` — schaltet den Klingelton bei eingehenden Anrufen ein/aus.",
			EN: "`/opentalk ring on|off|status` — toggle the ringtone for incoming calls.",
		})), nil
	}
}
