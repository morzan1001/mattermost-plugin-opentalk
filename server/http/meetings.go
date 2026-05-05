package http

import (
	"encoding/json"
	nethttp "net/http"
	"time"

	"github.com/opentalk/mattermost-plugin-opentalk/server/opentalk"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

type createMeetingRequest struct {
	ChannelID    string `json:"channel_id"`
	DeviceSecret string `json:"device_secret"`
}

type createMeetingResponse struct {
	RoomID        string `json:"room_id"`
	InviteCode    string `json:"invite_code"`
	Ticket        string `json:"ticket"`
	Resumption    string `json:"resumption"`
	RoomserverURL string `json:"roomserver_url"`
	PostID        string `json:"post_id,omitempty"`
}

// MeetingsCreate handles POST /api/v1/meetings. The host (= request user) gets
// a fully provisioned room: room created, invite generated, host start-ticket
// retrieved. ActiveMeeting is persisted; custom-post creation is deferred to
// Phase 4.
func (h *Handlers) MeetingsCreate(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}

	var body createMeetingRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	if body.ChannelID == "" || body.DeviceSecret == "" {
		nethttp.Error(w, "channel_id and device_secret are required", nethttp.StatusBadRequest)
		return
	}

	token, err := h.AccessTokenFor(mmUserID)
	if err != nil {
		nethttp.Error(w, "access token unavailable: "+err.Error(), nethttp.StatusUnauthorized)
		return
	}

	room, err := h.OpenTalk.CreateRoom(token, opentalk.CreateRoomRequest{
		EnableSIP:   h.Defaults.EnableSIP,
		WaitingRoom: h.Defaults.WaitingRoom,
	})
	if err != nil {
		nethttp.Error(w, "create room: "+err.Error(), nethttp.StatusBadGateway)
		return
	}

	expiry := time.Now().Add(time.Duration(h.Defaults.InviteExpirationHours) * time.Hour).UTC()
	invite, err := h.OpenTalk.CreateInvite(token, room.ID, opentalk.CreateInviteRequest{Expiration: &expiry})
	if err != nil {
		nethttp.Error(w, "create invite: "+err.Error(), nethttp.StatusBadGateway)
		return
	}

	start, err := h.OpenTalk.StartRoom(token, room.ID, opentalk.StartRequest{
		DeviceSecret: body.DeviceSecret,
	})
	if err != nil {
		nethttp.Error(w, "start room: "+err.Error(), nethttp.StatusBadGateway)
		return
	}

	am := &store.ActiveMeeting{
		ChannelID:     body.ChannelID,
		RoomID:        room.ID,
		InviteCode:    invite.InviteCode,
		HostUserID:    mmUserID,
		CreatedAt:     time.Now().UTC(),
		LastHeartbeat: time.Now().UTC(),
		EnableSIP:     h.Defaults.EnableSIP,
	}
	if err := h.Store.SaveActiveMeeting(am); err != nil {
		nethttp.Error(w, "persist meeting: "+err.Error(), nethttp.StatusInternalServerError)
		return
	}

	resp := createMeetingResponse{
		RoomID:        room.ID,
		InviteCode:    invite.InviteCode,
		Ticket:        start.Ticket,
		Resumption:    start.Resumption,
		RoomserverURL: h.RoomserverURL,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
