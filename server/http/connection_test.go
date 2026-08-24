package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/crypto"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

var meEncKey = []byte("0123456789abcdef0123456789abcdef")

func encryptedUserInfoForMe(t *testing.T, info *store.UserInfo) []byte {
	t.Helper()
	raw, err := json.Marshal(info)
	require.NoError(t, err)
	enc, err := crypto.Encrypt(meEncKey, raw)
	require.NoError(t, err)
	return enc
}

func TestMe_ReportsConnected(t *testing.T) {
	api := &plugintest.API{}
	enc := encryptedUserInfoForMe(t, &store.UserInfo{
		MattermostUserID: "u1",
		OpenTalkEmail:    "alice@example.com",
		OpenTalkSub:      "kc-sub-1",
		AccessToken:      "x",
		RefreshToken:     "y",
		AccessExpiry:     time.Now().Add(time.Hour),
	})
	api.On("KVGet", mock.AnythingOfType("string")).Return(enc, nil)

	h := &Handlers{Store: store.New(api), EncryptionKey: meEncKey}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("Mattermost-User-ID", "u1")
	rr := httptest.NewRecorder()
	h.Me(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var resp meResponse
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.True(t, resp.Connected)
	assert.Equal(t, "alice@example.com", resp.Email)
	assert.Equal(t, "kc-sub-1", resp.Sub)
}

func TestMe_ReportsDisconnectedWhenNoUserInfo(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := &Handlers{Store: store.New(api), EncryptionKey: meEncKey}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("Mattermost-User-ID", "u-absent")
	rr := httptest.NewRecorder()
	h.Me(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var resp meResponse
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.False(t, resp.Connected)
	assert.Empty(t, resp.Email)
}

func TestMe_RejectsMissingUserHeader(t *testing.T) {
	h := &Handlers{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	rr := httptest.NewRecorder()
	h.Me(rr, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestMe_IncludesPersistedRingtone(t *testing.T) {
	api := &plugintest.API{}
	enc := encryptedUserInfoForMe(t, &store.UserInfo{MattermostUserID: "u1", OpenTalkEmail: "alice@example.com"})
	api.On("KVGet", "ring_u1").Return([]byte("false"), nil)
	api.On("KVGet", mock.AnythingOfType("string")).Return(enc, nil)

	h := &Handlers{Store: store.New(api), EncryptionKey: meEncKey}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("Mattermost-User-ID", "u1")
	rr := httptest.NewRecorder()
	h.Me(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()
	var resp meResponse
	require.NoError(t, json.Unmarshal([]byte(body), &resp))
	require.NotNil(t, resp.RingtoneEnabled)
	assert.False(t, *resp.RingtoneEnabled)
	assert.Contains(t, body, `"ringtone_enabled":false`)
}

func TestMe_OmitsUnsetRingtone(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := &Handlers{Store: store.New(api), EncryptionKey: meEncKey}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("Mattermost-User-ID", "u-absent")
	rr := httptest.NewRecorder()
	h.Me(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	assert.NotContains(t, rr.Body.String(), "ringtone_enabled")
}

func TestMe_RingtoneLookupFailureIsBestEffort(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil).Once()
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), &model.AppError{Message: "kv down"})

	warns := 0
	h := &Handlers{Store: store.New(api), EncryptionKey: meEncKey, LogWarn: func(string, ...any) { warns++ }}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("Mattermost-User-ID", "u1")
	rr := httptest.NewRecorder()
	h.Me(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	assert.NotContains(t, rr.Body.String(), "ringtone_enabled")
	assert.Equal(t, 1, warns)
}

func TestRingtone_SavesAndBroadcastsUserScoped(t *testing.T) {
	api := &plugintest.API{}
	for _, enabled := range []bool{true, false} {
		api.On("KVSetWithExpiry", "ring_u1", []byte(map[bool]string{true: "true", false: "false"}[enabled]), int64(0)).Return(nil)
	}

	var gotEvent string
	var gotPayload map[string]any
	var gotBroadcast *model.WebsocketBroadcast
	h := &Handlers{
		Store: store.New(api),
		BroadcastFunc: func(event string, payload map[string]any, b *model.WebsocketBroadcast) {
			gotEvent = event
			gotPayload = payload
			gotBroadcast = b
		},
	}

	for _, enabled := range []bool{true, false} {
		body, err := json.Marshal(map[string]bool{"enabled": enabled})
		require.NoError(t, err)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ringtone", bytes.NewReader(body))
		req.Header.Set("Mattermost-User-ID", "u1")
		rr := httptest.NewRecorder()
		h.Ringtone(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "ring_setting_changed", gotEvent)
		assert.Equal(t, "u1", gotPayload["mm_user_id"])
		assert.Equal(t, enabled, gotPayload["enabled"])
		require.NotNil(t, gotBroadcast)
		assert.Equal(t, "u1", gotBroadcast.UserId, "broadcast must be user-scoped so other tabs update")
	}
	api.AssertExpectations(t)
}

func TestRingtone_RejectsMissingUserHeader(t *testing.T) {
	h := &Handlers{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ringtone", bytes.NewReader([]byte(`{"enabled":true}`)))
	rr := httptest.NewRecorder()
	h.Ringtone(rr, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestRingtone_RejectsBadBodies(t *testing.T) {
	tests := map[string]string{
		"invalid json": `{`,
		"missing key":  `{}`,
		"wrong type":   `{"enabled":"yes"}`,
	}
	for name, body := range tests {
		t.Run(name, func(t *testing.T) {
			api := &plugintest.API{}
			saved := false
			api.On("KVSetWithExpiry", mock.Anything, mock.Anything, mock.Anything).
				Run(func(mock.Arguments) { saved = true }).Return(nil)

			h := &Handlers{Store: store.New(api)}
			req := httptest.NewRequest(http.MethodPost, "/api/v1/ringtone", bytes.NewReader([]byte(body)))
			req.Header.Set("Mattermost-User-ID", "u1")
			rr := httptest.NewRecorder()
			h.Ringtone(rr, req)

			assert.Equal(t, http.StatusBadRequest, rr.Code)
			assert.False(t, saved, "invalid body must not reach the store")
		})
	}
}
