package http

import (
	"encoding/json"
	"errors"
	nethttp "net/http"
	"time"

	"github.com/gorilla/mux"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/opentalk"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/post"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
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

// MeetingsCreate handles POST /api/v1/meetings. Provisions a room for the
// requesting user: creates the room, invite, and host start-ticket, then
// persists the ActiveMeeting and creates the bot post.
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

	// Guard: reject a second concurrent meeting in the same channel.
	if existing, lErr := h.Store.LoadActiveMeeting(body.ChannelID); lErr == nil && existing != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(nethttp.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error":        "meeting already active in this channel",
			"room_id":      existing.RoomID,
			"post_id":      existing.PostID,
			"host_user_id": existing.HostUserID,
		})
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

type endMeetingRequest struct {
	ChannelID string `json:"channel_id"`
}

// MeetingsEnd is the host-only "end meeting for everyone" endpoint. Looks up
// the ActiveMeeting by channel, verifies the requester is the host, marks the
// custom-post as ENDED, deletes the ActiveMeeting record, and broadcasts a
// meeting_ended ws-event so other clients tear down their session.
func (h *Handlers) MeetingsEnd(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body endMeetingRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	if body.ChannelID == "" {
		nethttp.Error(w, "channel_id required", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(body.ChannelID)
	if err != nil {
		nethttp.Error(w, "no active meeting in this channel", nethttp.StatusNotFound)
		return
	}
	if am.HostUserID != mmUserID {
		nethttp.Error(w, "only the host can end the meeting", nethttp.StatusForbidden)
		return
	}

	// Mark post ENDED (best-effort; meeting state is gone after this).
	if am.PostID != "" && h.PostGetter != nil && h.PostUpdater != nil {
		if p, getErr := h.PostGetter(am.PostID); getErr == nil && p != nil {
			post.ApplyEndedStatus(p, time.Now().UTC())
			_ = h.PostUpdater(p)
		}
	}

	if delErr := h.Store.DeleteActiveMeeting(body.ChannelID); delErr != nil {
		nethttp.Error(w, "delete meeting: "+delErr.Error(), nethttp.StatusInternalServerError)
		return
	}

	if h.BroadcastFunc != nil {
		h.BroadcastFunc("meeting_ended", map[string]any{
			"channel_id": body.ChannelID,
			"room_id":    am.RoomID,
		})
	}

	w.WriteHeader(nethttp.StatusNoContent)
}

type dismissRequest struct {
	ChannelID string `json:"channel_id"`
	RoomID    string `json:"room_id"`
}

// MeetingsDismiss records that the requesting user declined the incoming call.
// When all non-host channel members have declined, the meeting is automatically
// marked MISSED and meeting_ended is broadcast.
func (h *Handlers) MeetingsDismiss(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body dismissRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	if body.ChannelID == "" || body.RoomID == "" {
		nethttp.Error(w, "channel_id and room_id required", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(body.ChannelID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			// Meeting already ended; treat dismiss as a no-op.
			w.WriteHeader(nethttp.StatusNoContent)
			return
		}
		nethttp.Error(w, "load meeting: "+err.Error(), nethttp.StatusInternalServerError)
		return
	}
	if am.RoomID != body.RoomID {
		// Different meeting is now active; stale dismiss — no-op.
		w.WriteHeader(nethttp.StatusNoContent)
		return
	}

	dismissedSet, err := h.Store.AddDismissal(body.ChannelID, body.RoomID, mmUserID)
	if err != nil {
		nethttp.Error(w, "save dismissal: "+err.Error(), nethttp.StatusInternalServerError)
		return
	}

	if h.BroadcastFunc != nil {
		h.BroadcastFunc("incoming_call_dismissed", map[string]any{
			"channel_id": body.ChannelID,
			"room_id":    body.RoomID,
			"mm_user_id": mmUserID,
		})
	}

	// All non-host members declined? -> MISSED.
	if h.ChannelMembersOf != nil {
		members := h.ChannelMembersOf(body.ChannelID)
		recipients := make([]string, 0, len(members))
		for _, uid := range members {
			if uid != am.HostUserID {
				recipients = append(recipients, uid)
			}
		}
		if len(recipients) > 0 && allIn(dismissedSet, recipients) {
			if am.PostID != "" && h.PostGetter != nil && h.PostUpdater != nil {
				if pp, ge := h.PostGetter(am.PostID); ge == nil && pp != nil {
					post.ApplyMissedStatus(pp, time.Now().UTC())
					_ = h.PostUpdater(pp)
				}
			}
			_ = h.Store.DeleteActiveMeeting(body.ChannelID)
			_ = h.Store.DeleteDismissals(body.ChannelID, body.RoomID)
			if h.BroadcastFunc != nil {
				h.BroadcastFunc("meeting_ended", map[string]any{
					"channel_id": body.ChannelID,
					"room_id":    body.RoomID,
				})
			}
		}
	}

	w.WriteHeader(nethttp.StatusNoContent)
}

type heartbeatRequest struct {
	ChannelID string `json:"channel_id"`
}

// MeetingsHeartbeat updates the LastHeartbeat timestamp on the active
// meeting for the given channel. The webapp pings this endpoint every
// 30s while the user is in a meeting; the reaper uses the timestamp to
// detect dead sessions and end orphaned meetings.
//
// Quietly returns 204 if no active meeting is found — the webapp shouldn't
// have to coordinate with the server about meeting-end races.
func (h *Handlers) MeetingsHeartbeat(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body heartbeatRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	if body.ChannelID == "" {
		nethttp.Error(w, "channel_id required", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(body.ChannelID)
	if err != nil || am == nil {
		// No active meeting — no-op. Keeps the webapp's heartbeat
		// ticker from alarming when the meeting just ended elsewhere.
		w.WriteHeader(nethttp.StatusNoContent)
		return
	}

	am.LastHeartbeat = time.Now().UTC()
	if sErr := h.Store.SaveActiveMeeting(am); sErr != nil {
		nethttp.Error(w, "save heartbeat: "+sErr.Error(), nethttp.StatusInternalServerError)
		return
	}

	w.WriteHeader(nethttp.StatusNoContent)
}

func allIn(set, want []string) bool {
	if len(want) == 0 {
		return true
	}
	m := make(map[string]bool, len(set))
	for _, s := range set {
		m[s] = true
	}
	for _, w := range want {
		if !m[w] {
			return false
		}
	}
	return true
}
