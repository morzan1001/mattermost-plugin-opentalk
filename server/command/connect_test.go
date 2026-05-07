package command

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
)

// TestConnect_HappyPath_ContainsOAuthStartURL verifies that when the user is
// not yet connected, the ephemeral response includes the plugin OAuth start URL
// composed from SiteURL + PluginID.
func TestConnect_HappyPath_ContainsOAuthStartURL(t *testing.T) {
	api := &plugintest.API{}
	// KVGet returns nil → store.ErrNotFound → not connected yet.
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := newHandler(api)
	resp, appErr := h.Execute(mkArgs("u1", "/opentalk connect"))

	assert.Nil(t, appErr)
	assert.NotNil(t, resp)
	assert.Contains(t, resp.Text, "/plugins/com.github.morzan1001.mattermost-plugin-opentalk/oauth/start")
	assert.Contains(t, resp.Text, "http://localhost:8065")
}

// TestConnect_EN_ContainsEnglishText ensures the English locale is used when
// LocaleOf returns a non-German value.
func TestConnect_EN_ContainsEnglishText(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "en" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Contains(t, resp.Text, "Click here to connect")
}

// TestConnect_DE_ContainsGermanText ensures the German locale path is taken
// when the user has locale "de".
func TestConnect_DE_ContainsGermanText(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Contains(t, resp.Text, "Klicke hier")
}

// TestConnect_AlreadyConnected verifies the "already connected" branch when
// LoadUserInfo succeeds (non-nil, no error).
func TestConnect_AlreadyConnected(t *testing.T) {
	api := &plugintest.API{}
	// connectedUserInfoBytes is defined in start_test.go (same package).
	api.On("KVGet", mock.AnythingOfType("string")).Return(connectedUserInfoBytes(t), nil)

	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Contains(t, resp.Text, "already connected")
}

// TestConnect_EmptySiteURL confirms the handler does not crash when SiteURL is
// not set — the OAuth URL will be relative but the response is still valid.
func TestConnect_EmptySiteURL(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := newHandler(api)
	h.SiteURL = ""

	resp, appErr := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Nil(t, appErr)
	assert.NotNil(t, resp)
	// URL fragment is still present even with empty SiteURL.
	assert.Contains(t, resp.Text, "/plugins/")
	assert.Contains(t, resp.Text, "/oauth/start")
}
