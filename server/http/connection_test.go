package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/opentalk/mattermost-plugin-opentalk/server/crypto"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
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
