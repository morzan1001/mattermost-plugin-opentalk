package command

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/crypto"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// encryptedUserInfo returns AES-GCM-encrypted bytes for the given UserInfo
// using the shared encKey from command_test.go.
func encryptedUserInfo(t *testing.T, info *store.UserInfo) []byte {
	t.Helper()
	raw, err := json.Marshal(info)
	require.NoError(t, err)
	enc, err := crypto.Encrypt(encKey, raw)
	require.NoError(t, err)
	return enc
}

// TestInfo_NotConnected_EN verifies the English "not connected" response when
// the user has no stored UserInfo (KVGet → nil).
func TestInfo_NotConnected_EN(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "en" }

	resp, appErr := h.Execute(mkArgs("u1", "/opentalk info"))

	assert.Nil(t, appErr)
	assert.NotNil(t, resp)
	assert.Contains(t, resp.Text, "not connected")
}

// TestInfo_NotConnected_DE verifies the German "nicht verbunden" response.
func TestInfo_NotConnected_DE(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk info"))
	assert.Contains(t, resp.Text, "nicht mit OpenTalk verbunden")
}

// TestInfo_Connected_EN verifies that a connected user sees their OpenTalk
// email address and sub in the English response.
func TestInfo_Connected_EN(t *testing.T) {
	info := &store.UserInfo{
		MattermostUserID: "u1",
		OpenTalkSub:      "kc-sub-en",
		OpenTalkEmail:    "info-en@example.com",
		AccessToken:      "tok",
		RefreshToken:     "rt",
		AccessExpiry:     time.Now().Add(time.Hour),
		ConnectedAt:      time.Now().Add(-30 * time.Minute),
	}

	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return(encryptedUserInfo(t, info), nil)

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "en" }

	resp, appErr := h.Execute(mkArgs("u1", "/opentalk info"))

	assert.Nil(t, appErr)
	assert.NotNil(t, resp)
	assert.Contains(t, resp.Text, "info-en@example.com")
	assert.Contains(t, resp.Text, "kc-sub-en")
	assert.Contains(t, resp.Text, "Connected as")
}

// TestInfo_Connected_DE verifies that a connected user sees a German response
// including "Verbunden als".
func TestInfo_Connected_DE(t *testing.T) {
	info := &store.UserInfo{
		MattermostUserID: "u1",
		OpenTalkSub:      "kc-sub-de",
		OpenTalkEmail:    "info-de@example.com",
		AccessToken:      "tok",
		RefreshToken:     "rt",
		AccessExpiry:     time.Now().Add(time.Hour),
		ConnectedAt:      time.Now().Add(-1 * time.Hour),
	}

	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return(encryptedUserInfo(t, info), nil)

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk info"))
	assert.Contains(t, resp.Text, "Verbunden als")
	assert.Contains(t, resp.Text, "info-de@example.com")
}
