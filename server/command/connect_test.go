package command

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
)

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

func TestConnect_EN_ContainsEnglishText(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "en" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Contains(t, resp.Text, "Click here to connect")
}

func TestConnect_DE_ContainsGermanText(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Contains(t, resp.Text, "Klicke hier")
}

func TestConnect_AlreadyConnected(t *testing.T) {
	api := &plugintest.API{}
	// connectedUserInfoBytes is defined in start_test.go (same package).
	api.On("KVGet", mock.AnythingOfType("string")).Return(connectedUserInfoBytes(t), nil)

	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Contains(t, resp.Text, "already connected")
}

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
