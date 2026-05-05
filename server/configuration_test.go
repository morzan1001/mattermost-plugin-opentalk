package main

import (
	"errors"
	"testing"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/mattermost/mattermost/server/public/pluginapi"
	"github.com/stretchr/testify/assert"
)

func TestConfiguration_IsValid(t *testing.T) {
	t.Run("rejects empty controller URL", func(t *testing.T) {
		c := &Configuration{}
		err := c.IsValid()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "OpenTalkControllerURL")
	})

	t.Run("rejects empty frontend URL", func(t *testing.T) {
		c := &Configuration{
			OpenTalkControllerURL: "https://controller.example",
		}
		err := c.IsValid()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "OpenTalkFrontendURL")
	})

	t.Run("rejects empty roomserver URL", func(t *testing.T) {
		c := &Configuration{
			OpenTalkControllerURL: "https://controller.example",
			OpenTalkFrontendURL:   "https://opentalk.example",
		}
		err := c.IsValid()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "OpenTalkRoomserverURL")
	})

	t.Run("rejects empty OIDC authority", func(t *testing.T) {
		c := &Configuration{
			OpenTalkControllerURL: "https://controller.example",
			OpenTalkFrontendURL:   "https://opentalk.example",
			OpenTalkRoomserverURL: "wss://controller.example",
		}
		err := c.IsValid()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "OIDCAuthority")
	})

	t.Run("rejects invite expiration below 1 hour", func(t *testing.T) {
		c := &Configuration{
			OpenTalkControllerURL: "https://controller.example",
			OpenTalkFrontendURL:   "https://opentalk.example",
			OpenTalkRoomserverURL: "wss://controller.example",
			OIDCAuthority:         "https://keycloak.example/realms/opentalk",
			OIDCClientID:          "mattermost-plugin-opentalk",
			OIDCClientSecret:      "secret",
			InviteExpirationHours: 0,
		}
		err := c.IsValid()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "InviteExpirationHours")
	})

	t.Run("accepts complete config", func(t *testing.T) {
		c := &Configuration{
			OpenTalkControllerURL: "https://controller.example",
			OpenTalkFrontendURL:   "https://opentalk.example",
			OpenTalkRoomserverURL: "wss://controller.example",
			OIDCAuthority:         "https://keycloak.example/realms/opentalk",
			OIDCClientID:          "mattermost-plugin-opentalk",
			OIDCClientSecret:      "secret",
			InviteExpirationHours: 24,
		}
		err := c.IsValid()
		assert.NoError(t, err)
	})
}

func TestPlugin_OnConfigurationChange(t *testing.T) {
	t.Run("rejects invalid configuration", func(t *testing.T) {
		api := &plugintest.API{}
		api.On("LoadPluginConfiguration", mock.AnythingOfType("*main.Configuration")).
			Return(func(dest interface{}) error {
				cfg := dest.(*Configuration)
				cfg.OpenTalkControllerURL = "" // invalid
				return nil
			})

		p := &Plugin{client: pluginapi.NewClient(api, nil)}
		p.SetAPI(api)

		err := p.OnConfigurationChange()
		assert.Error(t, err)
	})

	t.Run("stores valid configuration", func(t *testing.T) {
		api := &plugintest.API{}
		api.On("LoadPluginConfiguration", mock.AnythingOfType("*main.Configuration")).
			Return(func(dest interface{}) error {
				cfg := dest.(*Configuration)
				cfg.OpenTalkControllerURL = "https://controller.example"
				cfg.OpenTalkFrontendURL = "https://opentalk.example"
				cfg.OpenTalkRoomserverURL = "wss://controller.example"
				cfg.OIDCAuthority = "https://keycloak.example/realms/opentalk"
				cfg.OIDCClientID = "mattermost-plugin-opentalk"
				cfg.OIDCClientSecret = "secret"
				cfg.InviteExpirationHours = 24
				return nil
			})

		p := &Plugin{client: pluginapi.NewClient(api, nil)}
		p.SetAPI(api)

		err := p.OnConfigurationChange()
		assert.NoError(t, err)
		assert.Equal(t, "https://controller.example", p.getConfiguration().OpenTalkControllerURL)
	})

	t.Run("propagates LoadPluginConfiguration error", func(t *testing.T) {
		api := &plugintest.API{}
		api.On("LoadPluginConfiguration", mock.AnythingOfType("*main.Configuration")).
			Return(errors.New("load failed"))

		p := &Plugin{client: pluginapi.NewClient(api, nil)}
		p.SetAPI(api)

		err := p.OnConfigurationChange()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "load failed")
	})
}
