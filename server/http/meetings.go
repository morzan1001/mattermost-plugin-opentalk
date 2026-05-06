package http

import (
	"encoding/json"
	nethttp "net/http"
	"time"

	"github.com/gorilla/mux"

	"github.com/opentalk/mattermost-plugin-opentalk/server/opentalk"
	"github.com/opentalk/mattermost-plugin-opentalk/server/post"
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

	// Build and post the custom-post via the bot. We persist ActiveMeeting
	// *before* the post so that even if the post call fails we still know
	// about the live room (cleanup is handled by Phase-5 expiry logic).
	hostName := mmUserID
	if h.HostUsernameOf != nil {
		if n := h.HostUsernameOf(mmUserID); n != "" {
			hostName = n
		}
	}
	botPost := post.BuildMeetingPost(am, h.FrontendURL, hostName)
	botPost.UserId = h.BotUserID
	created, err := h.CreatePost(botPost)
	if err != nil {
		nethttp.Error(w, "post meeting card: "+err.Error(), nethttp.StatusInternalServerError)
		return
	}
	am.PostID = created.Id
	if err := h.Store.SaveActiveMeeting(am); err != nil {
		nethttp.Error(w, "persist meeting (with post_id): "+err.Error(), nethttp.StatusInternalServerError)
		return
	}

	resp := createMeetingResponse{
		RoomID:        room.ID,
		InviteCode:    invite.InviteCode,
		Ticket:        start.Ticket,
		Resumption:    start.Resumption,
		RoomserverURL: h.RoomserverURL,
		PostID:        created.Id,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

type joinMeetingRequest struct {
	ChannelID    string `json:"channel_id"`
	DeviceSecret string `json:"device_secret"`
	Resumption   string `json:"resumption,omitempty"`
}

type joinMeetingResponse struct {
	Ticket        string `json:"ticket"`
	Resumption    string `json:"resumption"`
	RoomserverURL string `json:"roomserver_url"`
}

// MeetingsJoin handles POST /api/v1/meetings/{room_id}/join. The webapp calls
// this when a participant clicks JOIN on the custom-post. The handler picks
// between StartRoom (registered/connected) and StartInvited (guest) based on
// whether the user has UserInfo in the KV store.
func (h *Handlers) MeetingsJoin(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	roomID := mux.Vars(r)["room_id"]
	if roomID == "" {
		nethttp.Error(w, "missing room_id", nethttp.StatusBadRequest)
		return
	}

	var body joinMeetingRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	if body.ChannelID == "" || body.DeviceSecret == "" {
		nethttp.Error(w, "channel_id and device_secret are required", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(body.ChannelID)
	if err != nil {
		nethttp.Error(w, "no active meeting in this channel", nethttp.StatusNotFound)
		return
	}
	if am.RoomID != roomID {
		nethttp.Error(w, "room_id does not match active meeting in channel", nethttp.StatusBadRequest)
		return
	}

	displayName := mmUserID
	if h.UsernameOf != nil {
		if n := h.UsernameOf(mmUserID); n != "" {
			displayName = n
		}
	}

	var start *opentalk.StartResponse
	var startErr error
	if h.IsConnected != nil && h.IsConnected(mmUserID) {
		token, terr := h.AccessTokenFor(mmUserID)
		if terr != nil {
			nethttp.Error(w, "access token: "+terr.Error(), nethttp.StatusUnauthorized)
			return
		}
		start, startErr = h.OpenTalk.StartRoom(token, roomID, opentalk.StartRequest{
			DeviceSecret: body.DeviceSecret,
			DisplayName:  displayName,
			Resumption:   body.Resumption,
		})
	} else {
		start, startErr = h.OpenTalk.StartInvited(roomID, opentalk.StartInvitedRequest{
			InviteCode:   am.InviteCode,
			DeviceSecret: body.DeviceSecret,
			DisplayName:  displayName,
			Resumption:   body.Resumption,
		})
	}
	if startErr != nil {
		nethttp.Error(w, "start: "+startErr.Error(), nethttp.StatusBadGateway)
		return
	}

	resp := joinMeetingResponse{
		Ticket:        start.Ticket,
		Resumption:    start.Resumption,
		RoomserverURL: h.RoomserverURL,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
