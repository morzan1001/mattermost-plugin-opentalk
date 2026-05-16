package command

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/post"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) end(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)

	am, err := h.Store.LoadActiveMeeting(h.EncryptionKey, args.ChannelId)
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
	if am.HostUserID != args.UserId {
		return ephemeral(i18n.T(locale, i18n.Translatable{
			DE: "Nur der Host darf das Meeting beenden.",
			EN: "Only the host can end the meeting.",
		})), nil
	}

	if am.PostID != "" && h.PostGetter != nil && h.PostUpdater != nil {
		p, getErr := h.PostGetter(am.PostID)
		if getErr == nil && p != nil {
			post.ApplyEndedStatus(p, time.Now().UTC())
			if updErr := h.PostUpdater(p); updErr != nil {
				h.API.LogWarn("end: post update failed", "err", updErr.Error())
			}
		}
	}

	if delErr := h.Store.DeleteActiveMeeting(args.ChannelId); delErr != nil {
		return ephemeral(fmt.Sprintf(i18n.T(locale, i18n.Translatable{
			DE: "Meeting-State konnte nicht gelöscht werden: %v",
			EN: "Failed to delete meeting state: %v",
		}), delErr)), nil
	}

	if h.Broadcaster != nil {
		h.Broadcaster("meeting_ended", map[string]any{
			"channel_id": args.ChannelId,
			"room_id":    am.RoomID,
		}, &model.WebsocketBroadcast{ChannelId: args.ChannelId})
	}

	if delErr := h.Store.DeleteDismissals(args.ChannelId, am.RoomID); delErr != nil {
		h.API.LogWarn("end: dismissals delete failed", "err", delErr.Error())
	}

	return ephemeral(i18n.T(locale, i18n.Translatable{
		DE: "Meeting beendet.",
		EN: "Meeting ended.",
	})), nil
}
