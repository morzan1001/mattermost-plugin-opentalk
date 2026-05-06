package command

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/opentalk/mattermost-plugin-opentalk/server/post"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

func (h *Handler) end(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	am, err := h.Store.LoadActiveMeeting(args.ChannelId)
	if err == store.ErrNotFound {
		return ephemeral("In diesem Channel läuft kein aktives Meeting."), nil
	}
	if err != nil {
		return ephemeral(fmt.Sprintf("Lookup fehlgeschlagen: %v", err)), nil
	}
	if am.HostUserID != args.UserId {
		return ephemeral("Nur der Host darf das Meeting beenden."), nil
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
		return ephemeral(fmt.Sprintf("Meeting-State konnte nicht gelöscht werden: %v", delErr)), nil
	}

	if h.Broadcaster != nil {
		h.Broadcaster("meeting_ended", map[string]any{
			"channel_id": args.ChannelId,
			"room_id":    am.RoomID,
		})
	}

	return ephemeral("Meeting beendet."), nil
}
