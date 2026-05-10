package http

import (
	"encoding/json"
	"errors"
	nethttp "net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"

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
	// about the live room; the reaper will clean it up.
	hostUsername := mmUserID
	if h.HostUsernameOf != nil {
		if n := h.HostUsernameOf(mmUserID); n != "" {
			hostUsername = n
		}
	}
	hostDisplayName := hostUsername
	if h.HostDisplayNameOf != nil {
		if n := h.HostDisplayNameOf(mmUserID); n != "" {
			hostDisplayName = n
		}
	}
	hostLocale := ""
	if h.LocaleOf != nil {
		hostLocale = h.LocaleOf(mmUserID)
	}
	isDM := false
	if h.IsDMChannel != nil {
		isDM = h.IsDMChannel(body.ChannelID)
	}
	botPost := post.BuildMeetingPost(am, h.FrontendURL, hostUsername, hostDisplayName, hostLocale, isDM)
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

	if _, eErr := h.endMeetingFor(am); eErr != nil {
		nethttp.Error(w, "delete meeting: "+eErr.Error(), nethttp.StatusInternalServerError)
		return
	}
	w.WriteHeader(nethttp.StatusNoContent)
}

// endMeetingFor runs the end-meeting side-effects and returns the updated post.
func (h *Handlers) endMeetingFor(am *store.ActiveMeeting) (*model.Post, error) {
	// Best-effort invite revoke; failures don't block the end-flow.
	if am.InviteCode != "" && h.OpenTalk != nil && h.AccessTokenFor != nil {
		if token, terr := h.AccessTokenFor(am.HostUserID); terr == nil {
			if dErr := h.OpenTalk.DeleteInvite(token, am.RoomID, am.InviteCode); dErr != nil {
				if h.LogWarn != nil {
					h.LogWarn("[opentalk] DeleteInvite failed", "room", am.RoomID, "invite", am.InviteCode, "err", dErr.Error())
				}
			}
		}
	}

	var updated *model.Post
	if am.PostID != "" && h.PostGetter != nil && h.PostUpdater != nil {
		if p, getErr := h.PostGetter(am.PostID); getErr == nil && p != nil {
			post.ApplyEndedStatus(p, time.Now().UTC())
			if uErr := h.PostUpdater(p); uErr == nil {
				updated = p
			}
		}
	}
	if delErr := h.Store.DeleteActiveMeeting(am.ChannelID); delErr != nil {
		return updated, delErr
	}
	if h.BroadcastFunc != nil {
		h.BroadcastFunc("meeting_ended", map[string]any{
			"channel_id": am.ChannelID,
			"room_id":    am.RoomID,
		})
	}
	return updated, nil
}

// MeetingsPostActionEnd backs the End-meeting button on a meeting-post attachment.
// Host-gated; non-host clicks return an EphemeralText, host clicks return an Update.
func (h *Handlers) MeetingsPostActionEnd(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body model.PostActionIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	channelID, _ := body.Context["channel_id"].(string)
	if channelID == "" {
		nethttp.Error(w, "channel_id required in context", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(channelID)
	if err != nil {
		writePostActionResponse(w, h.staleMeetingResponse(body.PostId, "This meeting is no longer active."))
		return
	}
	if am.HostUserID != mmUserID {
		writePostActionResponse(w, &model.PostActionIntegrationResponse{
			EphemeralText: "Only the host can end this meeting.",
		})
		return
	}

	updated, eErr := h.endMeetingFor(am)
	if eErr != nil {
		nethttp.Error(w, "end meeting: "+eErr.Error(), nethttp.StatusInternalServerError)
		return
	}
	if updated == nil {
		// Post update failed; meeting is ended in KV.
		writePostActionResponse(w, &model.PostActionIntegrationResponse{
			EphemeralText: "Meeting ended.",
		})
		return
	}
	writePostActionResponse(w, &model.PostActionIntegrationResponse{Update: updated})
}

// MeetingsPostActionDismiss backs the Decline button on a DM meeting attachment.
// Returns an Update post when the dismissal flips the meeting to MISSED.
func (h *Handlers) MeetingsPostActionDismiss(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body model.PostActionIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	channelID, _ := body.Context["channel_id"].(string)
	roomID, _ := body.Context["room_id"].(string)
	if channelID == "" || roomID == "" {
		nethttp.Error(w, "channel_id and room_id required in context", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(channelID)
	if err != nil {
		writePostActionResponse(w, h.staleMeetingResponse(body.PostId, "This meeting is no longer active."))
		return
	}
	if am.RoomID != roomID {
		writePostActionResponse(w, h.staleMeetingResponse(body.PostId, "This meeting is no longer active."))
		return
	}
	if mmUserID == am.HostUserID {
		writePostActionResponse(w, &model.PostActionIntegrationResponse{
			EphemeralText: "You are the host of this meeting.",
		})
		return
	}

	updated, dErr := h.dismissFor(am, mmUserID)
	if dErr != nil {
		nethttp.Error(w, "save dismissal: "+dErr.Error(), nethttp.StatusInternalServerError)
		return
	}
	if updated != nil {
		writePostActionResponse(w, &model.PostActionIntegrationResponse{Update: updated})
		return
	}
	writePostActionResponse(w, &model.PostActionIntegrationResponse{
		EphemeralText: "Call declined.",
	})
}

func writePostActionResponse(w nethttp.ResponseWriter, resp *model.PostActionIntegrationResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(nethttp.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// staleMeetingResponse returns an Update when the post is still fetchable, else only an ephemeral.
func (h *Handlers) staleMeetingResponse(postID, ephemeral string) *model.PostActionIntegrationResponse {
	resp := &model.PostActionIntegrationResponse{EphemeralText: ephemeral}
	if postID != "" && h.PostGetter != nil {
		if p, getErr := h.PostGetter(postID); getErr == nil && p != nil {
			resp.Update = p
		}
	}
	return resp
}

type dismissRequest struct {
	ChannelID string `json:"channel_id"`
	RoomID    string `json:"room_id"`
}

// dismissFor records the dismissal and returns the updated post if the dismissal flipped the meeting to MISSED.
func (h *Handlers) dismissFor(am *store.ActiveMeeting, mmUserID string) (*model.Post, error) {
	dismissedSet, err := h.Store.AddDismissal(am.ChannelID, am.RoomID, mmUserID)
	if err != nil {
		return nil, err
	}
	if h.BroadcastFunc != nil {
		h.BroadcastFunc("incoming_call_dismissed", map[string]any{
			"channel_id": am.ChannelID,
			"room_id":    am.RoomID,
			"mm_user_id": mmUserID,
		})
	}
	if h.ChannelMembersOf == nil {
		return nil, nil
	}
	members := h.ChannelMembersOf(am.ChannelID)
	recipients := make([]string, 0, len(members))
	for _, uid := range members {
		if uid != am.HostUserID {
			recipients = append(recipients, uid)
		}
	}
	if len(recipients) == 0 || !allIn(dismissedSet, recipients) {
		return nil, nil
	}

	var updated *model.Post
	if am.PostID != "" && h.PostGetter != nil && h.PostUpdater != nil {
		if pp, ge := h.PostGetter(am.PostID); ge == nil && pp != nil {
			post.ApplyMissedStatus(pp, time.Now().UTC())
			if uErr := h.PostUpdater(pp); uErr == nil {
				updated = pp
			}
		}
	}
	_ = h.Store.DeleteActiveMeeting(am.ChannelID)
	_ = h.Store.DeleteDismissals(am.ChannelID, am.RoomID)
	if h.BroadcastFunc != nil {
		h.BroadcastFunc("meeting_ended", map[string]any{
			"channel_id": am.ChannelID,
			"room_id":    am.RoomID,
		})
	}
	return updated, nil
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
			w.WriteHeader(nethttp.StatusNoContent)
			return
		}
		nethttp.Error(w, "load meeting: "+err.Error(), nethttp.StatusInternalServerError)
		return
	}
	if am.RoomID != body.RoomID {
		w.WriteHeader(nethttp.StatusNoContent)
		return
	}

	if _, eErr := h.dismissFor(am, mmUserID); eErr != nil {
		nethttp.Error(w, "save dismissal: "+eErr.Error(), nethttp.StatusInternalServerError)
		return
	}
	w.WriteHeader(nethttp.StatusNoContent)
}

type heartbeatRequest struct {
	ChannelID string `json:"channel_id"`
}

// MeetingsHeartbeat advances LastHeartbeat for the host. Returns 204 silently on race with meeting-end.
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
	if err != nil {
		w.WriteHeader(nethttp.StatusNoContent)
		return
	}

	if am.HostUserID != mmUserID {
		w.WriteHeader(nethttp.StatusNoContent)
		return
	}

	am.LastHeartbeat = time.Now().UTC()
	am.HostHeartbeatReceived = true
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
