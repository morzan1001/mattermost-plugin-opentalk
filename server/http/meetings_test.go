package http

import (
	"bytes"
	"encoding/json"
	nethttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/crypto"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/opentalk"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// stubOpenTalkServer fakes the OpenTalk-Controller for /v1/rooms etc.
func stubOpenTalkServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(nethttp.HandlerFunc(func(w nethttp.ResponseWriter, r *nethttp.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == nethttp.MethodPost && r.URL.Path == "/v1/rooms":
			w.Write([]byte(`{"id":"room-1","created_by":{"id":"u","email":"e","firstname":"f","lastname":"l","display_name":"alice"},"created_at":"2026-05-05T18:00:00Z","waiting_room":false}`))
		case r.Method == nethttp.MethodPost && strings.HasSuffix(r.URL.Path, "/invites"):
			w.Write([]byte(`{"invite_code":"inv-1","room_id":"room-1","active":true,"created":"2026-05-05T18:00:00Z","updated":"2026-05-05T18:00:00Z"}`))
		case r.Method == nethttp.MethodPost && strings.HasSuffix(r.URL.Path, "/start"):
			w.Write([]byte(`{"ticket":"room-1#xyz","resumption":"res-1"}`))
		default:
			w.WriteHeader(nethttp.StatusNotFound)
		}
	}))
}

func TestMeetingsCreate_HappyPath(t *testing.T) {
	otSrv := stubOpenTalkServer(t)
	defer otSrv.Close()

	api := &plugintest.API{}
	api.On("KVGet", mock.MatchedBy(func(k string) bool { return strings.HasPrefix(k, "meeting_") })).
		Return([]byte(nil), (*model.AppError)(nil))
	// CreateActiveMeetingAtomic uses KVSetWithOptions (atomic CAS); the
	// follow-up SaveActiveMeeting after the bot post uses KVSetWithExpiry.
	api.On("KVSetWithOptions", mock.MatchedBy(func(k string) bool { return strings.HasPrefix(k, "meeting_") }),
		mock.Anything, mock.AnythingOfType("model.PluginKVSetOptions")).Return(true, (*model.AppError)(nil))
	api.On("KVSetWithExpiry", mock.MatchedBy(func(k string) bool { return strings.HasPrefix(k, "meeting_") }),
		mock.Anything, int64(0)).Return(nil)

	var capturedPost *model.Post
	h := &Handlers{
		Store:         store.New(api),
		EncryptionKey: []byte("0123456789abcdef0123456789abcdef"),
		OpenTalk:      opentalk.NewClient(otSrv.URL),
		RoomserverURL: "wss://controller.example",
		Defaults: MeetingDefaults{
			EnableSIP:             false,
			WaitingRoom:           false,
			InviteExpirationHours: 24,
		},
		AccessTokenFor: func(_ string) (string, error) { return "tok", nil },
		BotUserID:      "bot-uid",
		FrontendURL:    "https://opentalk.example",
		CreatePost: func(p *model.Post) (*model.Post, error) {
			p.Id = "post-1"
			p.UserId = "bot-uid"
			capturedPost = p
			return p, nil
		},
		HostUsernameOf:    func(_ string) string { return "alice" },
		HostDisplayNameOf: func(_ string) string { return "Alice Tester" },
	}

	body := strings.NewReader(`{"channel_id":"ch-1","device_secret":"dev"}`)
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings", body)
	req.Header.Set("Mattermost-User-ID", "host-1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.MeetingsCreate(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "room-1", resp["room_id"])
	assert.Equal(t, "inv-1", resp["invite_code"])
	assert.Equal(t, "room-1#xyz", resp["ticket"])
	assert.Equal(t, "wss://controller.example", resp["roomserver_url"])

	require.NotNil(t, capturedPost, "expected bot-post to be created")
	assert.Equal(t, "custom_opentalk_meeting", capturedPost.Type)
	assert.Equal(t, "alice", capturedPost.GetProp("host_username"))
	assert.Equal(t, "Alice Tester", capturedPost.GetProp("host_display_name"))
	assert.Equal(t, "OpenTalk meeting", capturedPost.Message)
	assert.Equal(t, "post-1", resp["post_id"])
}

func TestMeetingsCreate_RejectsMissingUserHeader(t *testing.T) {
	h := &Handlers{}
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings", strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	h.MeetingsCreate(rr, req)
	assert.Equal(t, nethttp.StatusUnauthorized, rr.Code)
}

func TestMeetingsCreate_RejectsMissingChannelOrDevice(t *testing.T) {
	h := &Handlers{
		AccessTokenFor: func(string) (string, error) { return "tok", nil },
	}
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings", strings.NewReader(`{"channel_id":""}`))
	req.Header.Set("Mattermost-User-ID", "host")
	rr := httptest.NewRecorder()
	h.MeetingsCreate(rr, req)
	assert.Equal(t, nethttp.StatusBadRequest, rr.Code)
}

func TestMeetingsCreate_PropagatesAccessTokenError(t *testing.T) {
	h := &Handlers{
		AccessTokenFor: func(string) (string, error) { return "", store.ErrNotFound },
	}
	body := strings.NewReader(`{"channel_id":"ch","device_secret":"d"}`)
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings", body)
	req.Header.Set("Mattermost-User-ID", "host")
	rr := httptest.NewRecorder()
	h.MeetingsCreate(rr, req)
	assert.Equal(t, nethttp.StatusUnauthorized, rr.Code)
}

func TestMeetingsJoin_RegisteredUserPath(t *testing.T) {
	var receivedAuth, receivedPath string
	otSrv := httptest.NewServer(nethttp.HandlerFunc(func(w nethttp.ResponseWriter, r *nethttp.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == nethttp.MethodPost && r.URL.Path == "/v1/rooms/room-1/start" {
			receivedAuth = r.Header.Get("Authorization")
			receivedPath = r.URL.Path
			w.Write([]byte(`{"ticket":"room-1#abc","resumption":"res-1"}`))
			return
		}
		w.WriteHeader(nethttp.StatusNotFound)
	}))
	defer otSrv.Close()

	api := &plugintest.API{}
	am := &store.ActiveMeeting{ChannelID: "ch-1", RoomID: "room-1", InviteCode: "inv-1"}
	raw, _ := json.Marshal(am)
	api.On("KVGet", "meeting_ch-1").Return(raw, nil)

	h := &Handlers{
		Store:           store.New(api),
		OpenTalk:        opentalk.NewClient(otSrv.URL),
		RoomserverURL:   "wss://rs.example",
		AccessTokenFor:  func(_ string) (string, error) { return "tok-xyz", nil },
		IsConnected:     func(_ string) bool { return true },
		UsernameOf:      func(_ string) string { return "alice" },
		IsChannelMember: func(_, _ string) bool { return true },
	}

	body := strings.NewReader(`{"channel_id":"ch-1","device_secret":"dev-1"}`)
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/room-1/join", body)
	req.Header.Set("Mattermost-User-ID", "u1")
	rr := httptest.NewRecorder()
	router := mux.NewRouter()
	router.HandleFunc("/api/v1/meetings/{room_id}/join", h.MeetingsJoin).Methods(nethttp.MethodPost)
	router.ServeHTTP(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "room-1#abc", resp["ticket"])
	assert.Equal(t, "res-1", resp["resumption"])
	assert.Equal(t, "wss://rs.example", resp["roomserver_url"])
	assert.Equal(t, "Bearer tok-xyz", receivedAuth)
	assert.Equal(t, "/v1/rooms/room-1/start", receivedPath)
}

func TestMeetingsJoin_GuestPathUsesInvite(t *testing.T) {
	var receivedAuth string
	var receivedBody map[string]any
	otSrv := httptest.NewServer(nethttp.HandlerFunc(func(w nethttp.ResponseWriter, r *nethttp.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == nethttp.MethodPost && r.URL.Path == "/v1/rooms/room-1/start_invited" {
			receivedAuth = r.Header.Get("Authorization")
			json.NewDecoder(r.Body).Decode(&receivedBody)
			w.Write([]byte(`{"ticket":"room-1#guest","resumption":"res-g"}`))
			return
		}
	}))
	defer otSrv.Close()

	api := &plugintest.API{}
	am := &store.ActiveMeeting{ChannelID: "ch-1", RoomID: "room-1", InviteCode: "inv-1"}
	raw, _ := json.Marshal(am)
	api.On("KVGet", "meeting_ch-1").Return(raw, nil)

	h := &Handlers{
		Store:           store.New(api),
		OpenTalk:        opentalk.NewClient(otSrv.URL),
		RoomserverURL:   "wss://rs.example",
		IsConnected:     func(_ string) bool { return false },
		UsernameOf:      func(_ string) string { return "bob" },
		IsChannelMember: func(_, _ string) bool { return true },
	}

	body := strings.NewReader(`{"channel_id":"ch-1","device_secret":"dev-2"}`)
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/room-1/join", body)
	req.Header.Set("Mattermost-User-ID", "u-guest")
	rr := httptest.NewRecorder()
	router := mux.NewRouter()
	router.HandleFunc("/api/v1/meetings/{room_id}/join", h.MeetingsJoin).Methods(nethttp.MethodPost)
	router.ServeHTTP(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code, rr.Body.String())
	assert.Empty(t, receivedAuth, "guest path must not send Authorization")
	assert.Equal(t, "inv-1", receivedBody["invite_code"])
	assert.Equal(t, "bob", receivedBody["display_name"])
	assert.Equal(t, "dev-2", receivedBody["device_secret"])
}

func TestMeetingsJoin_NoActiveMeeting(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", "meeting_ch-x").Return([]byte(nil), nil)

	h := &Handlers{
		Store:           store.New(api),
		IsChannelMember: func(_, _ string) bool { return true },
	}
	body := strings.NewReader(`{"channel_id":"ch-x","device_secret":"dev"}`)
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/room-x/join", body)
	req.Header.Set("Mattermost-User-ID", "u1")
	rr := httptest.NewRecorder()
	router := mux.NewRouter()
	router.HandleFunc("/api/v1/meetings/{room_id}/join", h.MeetingsJoin).Methods(nethttp.MethodPost)
	router.ServeHTTP(rr, req)
	assert.Equal(t, nethttp.StatusNotFound, rr.Code)
}

func TestMeetingsJoin_RoomMismatch(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{ChannelID: "ch-1", RoomID: "room-1", InviteCode: "inv-1"}
	raw, _ := json.Marshal(am)
	api.On("KVGet", "meeting_ch-1").Return(raw, nil)

	h := &Handlers{
		Store:           store.New(api),
		IsChannelMember: func(_, _ string) bool { return true },
	}
	body := strings.NewReader(`{"channel_id":"ch-1","device_secret":"dev"}`)
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/room-WRONG/join", body)
	req.Header.Set("Mattermost-User-ID", "u1")
	rr := httptest.NewRecorder()
	router := mux.NewRouter()
	router.HandleFunc("/api/v1/meetings/{room_id}/join", h.MeetingsJoin).Methods(nethttp.MethodPost)
	router.ServeHTTP(rr, req)
	assert.Equal(t, nethttp.StatusBadRequest, rr.Code)
}

func TestMeetingsJoin_RejectsNonMember(t *testing.T) {
	h := &Handlers{
		IsChannelMember: func(_, _ string) bool { return false },
	}
	body := strings.NewReader(`{"channel_id":"ch-priv","device_secret":"dev"}`)
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/room-1/join", body)
	req.Header.Set("Mattermost-User-ID", "outsider")
	rr := httptest.NewRecorder()
	router := mux.NewRouter()
	router.HandleFunc("/api/v1/meetings/{room_id}/join", h.MeetingsJoin).Methods(nethttp.MethodPost)
	router.ServeHTTP(rr, req)
	assert.Equal(t, nethttp.StatusForbidden, rr.Code,
		"non-members must not receive a guest ticket for a channel they cannot see")
}

func TestMeetingsJoin_RejectsMissingUserHeader(t *testing.T) {
	h := &Handlers{}
	body := strings.NewReader(`{"channel_id":"ch","device_secret":"dev"}`)
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/room-1/join", body)
	rr := httptest.NewRecorder()
	router := mux.NewRouter()
	router.HandleFunc("/api/v1/meetings/{room_id}/join", h.MeetingsJoin).Methods(nethttp.MethodPost)
	router.ServeHTTP(rr, req)
	assert.Equal(t, nethttp.StatusUnauthorized, rr.Code)
}

// TestMeetingsHeartbeat_FlipsHostHeartbeatReceivedOnFirstCall verifies that
// the heartbeat handler flips HostHeartbeatReceived to true on the first
// successful host call and persists the meeting back to KV.
func TestMeetingsHeartbeat_FlipsHostHeartbeatReceived(t *testing.T) {
	api := &plugintest.API{}

	am := &store.ActiveMeeting{
		ChannelID:             "ch-1",
		RoomID:                "room-1",
		HostUserID:            "host-uid",
		CreatedAt:             time.Now().UTC().Add(-1 * time.Minute),
		LastHeartbeat:         time.Now().UTC().Add(-1 * time.Minute),
		HostHeartbeatReceived: false,
	}
	stored, err := json.Marshal(am)
	require.NoError(t, err)
	api.On("KVGet", "meeting_ch-1").Return(stored, nil)

	var saved []byte
	api.On("KVSetWithExpiry", "meeting_ch-1", mock.AnythingOfType("[]uint8"), mock.AnythingOfType("int64")).
		Run(func(args mock.Arguments) { saved = args.Get(1).([]byte) }).
		Return(nil)

	encKey := []byte("0123456789abcdef0123456789abcdef")
	h := &Handlers{Store: store.New(api), EncryptionKey: encKey}

	body, _ := json.Marshal(map[string]string{"channel_id": "ch-1"})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/heartbeat", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "host-uid")
	rr := httptest.NewRecorder()
	h.MeetingsHeartbeat(rr, req)

	assert.Equal(t, nethttp.StatusNoContent, rr.Code)

	plain, err := crypto.Decrypt(encKey, saved)
	require.NoError(t, err, "saved meeting must be encrypted at rest")
	var got store.ActiveMeeting
	require.NoError(t, json.Unmarshal(plain, &got))
	assert.True(t, got.HostHeartbeatReceived,
		"first host heartbeat must flip the flag")
	assert.False(t, got.LastHeartbeat.IsZero(), "LastHeartbeat must be advanced")
}

func TestMeetingsPostActionEnd_Host(t *testing.T) {
	api := &plugintest.API{}

	am := &store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		PostID:     "post-1",
		CreatedAt:  time.Now().UTC().Add(-5 * time.Minute),
	}
	stored, err := json.Marshal(am)
	require.NoError(t, err)
	api.On("KVGet", "meeting_ch-1").Return(stored, nil)
	api.On("KVDelete", "meeting_ch-1").Return(nil)

	var broadcasts []string
	h := &Handlers{
		Store: store.New(api),
		PostGetter: func(id string) (*model.Post, error) {
			return &model.Post{Id: id, Props: model.StringInterface{
				"started_at":    am.CreatedAt.Unix(),
				"frontend_url":  "https://opentalk.example",
				"host_username": "alice",
			}}, nil
		},
		PostUpdater: func(p *model.Post) error { return nil },
		BroadcastFunc: func(event string, _ map[string]any, b *model.WebsocketBroadcast) {
			broadcasts = append(broadcasts, event)
			require.NotNil(t, b, "broadcast scope must be set")
			require.Equal(t, "ch-1", b.ChannelId, "meeting_ended must be channel-scoped")
		},
	}

	body, _ := json.Marshal(model.PostActionIntegrationRequest{
		UserId:    "host-uid",
		ChannelId: "ch-1",
		PostId:    "post-1",
		Context: map[string]any{
			"channel_id": "ch-1",
			"room_id":    "room-1",
		},
	})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/post-action/end", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "host-uid")
	rr := httptest.NewRecorder()
	h.MeetingsPostActionEnd(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code, "host end action returns 200")

	var resp model.PostActionIntegrationResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.NotNil(t, resp.Update, "response must carry an Update post")
	assert.Equal(t, "ENDED", resp.Update.GetProp("status"))
	assert.Contains(t, broadcasts, "meeting_ended")
}

func TestMeetingsPostActionEnd_NonHost(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		PostID:     "post-1",
	}
	stored, err := json.Marshal(am)
	require.NoError(t, err)
	api.On("KVGet", "meeting_ch-1").Return(stored, nil)

	h := &Handlers{Store: store.New(api)}

	body, _ := json.Marshal(model.PostActionIntegrationRequest{
		UserId:    "intruder-uid",
		ChannelId: "ch-1",
		Context: map[string]any{
			"channel_id": "ch-1",
		},
	})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/post-action/end", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "intruder-uid")
	rr := httptest.NewRecorder()
	h.MeetingsPostActionEnd(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code, "non-host returns 200 with ephemeral text")
	var resp model.PostActionIntegrationResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Nil(t, resp.Update)
	assert.NotEmpty(t, resp.EphemeralText, "non-host gets a friendly ephemeral message")
	api.AssertNotCalled(t, "KVDelete", mock.Anything)
}

func TestMeetingsPostActionDismiss_StillLive(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "dm-ch",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		PostID:     "post-1",
	}
	stored, _ := json.Marshal(am)
	api.On("KVGet", "meeting_dm-ch").Return(stored, nil)
	api.On("KVGet", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "dismiss_")
	})).Return([]byte(nil), nil)
	api.On("KVSetWithExpiry", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "dismiss_")
	}), mock.Anything, mock.AnythingOfType("int64")).Return(nil)

	h := &Handlers{
		Store:           store.New(api),
		BroadcastFunc:   func(string, map[string]any, *model.WebsocketBroadcast) {},
		IsChannelMember: func(_, _ string) bool { return true },
		ChannelMembersOf: func(string) []string {
			return []string{"host-uid", "alice", "bob"}
		},
	}

	body, _ := json.Marshal(model.PostActionIntegrationRequest{
		UserId:    "alice",
		ChannelId: "dm-ch",
		Context: map[string]any{
			"channel_id": "dm-ch",
			"room_id":    "room-1",
		},
	})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/post-action/dismiss", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "alice")
	rr := httptest.NewRecorder()
	h.MeetingsPostActionDismiss(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code)
	var resp model.PostActionIntegrationResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Nil(t, resp.Update, "still-live meeting: no Update")
	assert.NotEmpty(t, resp.EphemeralText, "still-live meeting: ephemeral confirmation")
}

func TestMeetingsPostActionDismiss_FlipsMissed(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "dm-ch",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		PostID:     "post-1",
	}
	stored, _ := json.Marshal(am)
	api.On("KVGet", "meeting_dm-ch").Return(stored, nil)
	api.On("KVGet", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "dismiss_")
	})).Return([]byte(nil), nil)
	api.On("KVSetWithExpiry", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "dismiss_")
	}), mock.Anything, mock.AnythingOfType("int64")).Return(nil)
	api.On("KVDelete", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "meeting_") || strings.HasPrefix(k, "dismiss_")
	})).Return(nil)

	h := &Handlers{
		Store:           store.New(api),
		BroadcastFunc:   func(string, map[string]any, *model.WebsocketBroadcast) {},
		IsChannelMember: func(_, _ string) bool { return true },
		ChannelMembersOf: func(string) []string {
			return []string{"host-uid", "alice"}
		},
		PostGetter: func(id string) (*model.Post, error) {
			return &model.Post{Id: id, Props: model.StringInterface{
				"frontend_url":  "https://opentalk.example",
				"host_username": "host-display",
			}}, nil
		},
		PostUpdater: func(*model.Post) error { return nil },
	}

	body, _ := json.Marshal(model.PostActionIntegrationRequest{
		UserId:    "alice",
		ChannelId: "dm-ch",
		Context: map[string]any{
			"channel_id": "dm-ch",
			"room_id":    "room-1",
		},
	})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/post-action/dismiss", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "alice")
	rr := httptest.NewRecorder()
	h.MeetingsPostActionDismiss(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code)
	var resp model.PostActionIntegrationResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.NotNil(t, resp.Update, "last decliner: Update with MISSED post")
	assert.Equal(t, "MISSED", resp.Update.GetProp("status"))
}

// TestEndMeetingFor_DeleteInviteFailureIsNonFatal verifies that a failure from
// DeleteInvite does not prevent the local KV record from being deleted or the
// meeting_ended broadcast from firing.
func TestEndMeetingFor_DeleteInviteFailureIsNonFatal(t *testing.T) {
	// Stub OpenTalk server that rejects all DELETE requests.
	otSrv := httptest.NewServer(nethttp.HandlerFunc(func(w nethttp.ResponseWriter, r *nethttp.Request) {
		if r.Method == nethttp.MethodDelete {
			w.WriteHeader(nethttp.StatusInternalServerError)
			return
		}
		w.WriteHeader(nethttp.StatusNotFound)
	}))
	defer otSrv.Close()

	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		InviteCode: "inv-1",
	}
	api.On("KVDelete", "meeting_ch-1").Return(nil)

	var broadcasts []string
	h := &Handlers{
		Store:          store.New(api),
		OpenTalk:       opentalk.NewClient(otSrv.URL),
		AccessTokenFor: func(_ string) (string, error) { return "tok", nil },
		BroadcastFunc: func(event string, _ map[string]any, _ *model.WebsocketBroadcast) {
			broadcasts = append(broadcasts, event)
		},
	}

	_, err := h.endMeetingFor(am)
	require.NoError(t, err, "DeleteInvite failure must not propagate")
	assert.Contains(t, broadcasts, "meeting_ended")
	api.AssertCalled(t, "KVDelete", "meeting_ch-1")
}

func TestRouter_PostActionRoutesRegistered(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil).Maybe()
	h := &Handlers{Store: store.New(api)}

	router := NewRouter(h)

	for _, path := range []string{
		"/api/v1/meetings/post-action/end",
		"/api/v1/meetings/post-action/dismiss",
	} {
		body, _ := json.Marshal(model.PostActionIntegrationRequest{
			Context: map[string]any{
				"channel_id": "ch-x",
				"room_id":    "room-x",
			},
		})
		req := httptest.NewRequest(nethttp.MethodPost, path, bytes.NewReader(body))
		req.Header.Set("Mattermost-User-ID", "any-uid")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		assert.NotEqual(t, nethttp.StatusNotFound, rr.Code, "route %s must be registered", path)
	}
}
