package http

import (
	"encoding/json"
	nethttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/opentalk/mattermost-plugin-opentalk/server/opentalk"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
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
	api.On("KVSetWithExpiry", mock.MatchedBy(func(k string) bool { return strings.HasPrefix(k, "meeting_") }),
		mock.Anything, int64(0)).Return(nil)

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
