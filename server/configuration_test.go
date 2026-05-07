package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
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

	t.Run("rejects token encryption key shorter than 32 chars", func(t *testing.T) {
		c := &Configuration{
			OpenTalkControllerURL: "https://controller.example",
			OpenTalkFrontendURL:   "https://opentalk.example",
			OpenTalkRoomserverURL: "wss://controller.example",
			OIDCAuthority:         "https://keycloak.example/realms/opentalk",
			OIDCClientID:          "mattermost-plugin-opentalk",
			OIDCClientSecret:      "secret",
			InviteExpirationHours: 24,
			TokenEncryptionKey:    "tooshort",
		}
		err := c.IsValid()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "TokenEncryptionKey")
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
			TokenEncryptionKey:    "a-32-byte-encryption-key-padded!",
		}
		err := c.IsValid()
		assert.NoError(t, err)
	})
}

func TestPlugin_OnConfigurationChange(t *testing.T) {
	siteURL := "http://localhost:8065"
	mmConfig := &model.Config{}
	mmConfig.ServiceSettings.SiteURL = &siteURL

	var oidcSrv *httptest.Server
	oidcSrv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/.well-known/openid-configuration" {
			json.NewEncoder(w).Encode(map[string]any{
				"issuer":                                oidcSrv.URL,
				"authorization_endpoint":                oidcSrv.URL + "/auth",
				"token_endpoint":                        oidcSrv.URL + "/token",
				"userinfo_endpoint":                     oidcSrv.URL + "/userinfo",
				"jwks_uri":                              oidcSrv.URL + "/jwks",
				"id_token_signing_alg_values_supported": []string{"RS256"},
			})
			return
		}
	}))
	defer oidcSrv.Close()

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

	t.Run("stores valid configuration and initializes oidc client", func(t *testing.T) {
		api := &plugintest.API{}
		api.On("LoadPluginConfiguration", mock.AnythingOfType("*main.Configuration")).
			Return(func(dest interface{}) error {
				cfg := dest.(*Configuration)
				cfg.OpenTalkControllerURL = "https://controller.example"
				cfg.OpenTalkFrontendURL = "https://opentalk.example"
				cfg.OpenTalkRoomserverURL = "wss://controller.example"
				cfg.OIDCAuthority = oidcSrv.URL
				cfg.OIDCClientID = "mattermost-plugin-opentalk"
				cfg.OIDCClientSecret = "secret"
				cfg.OIDCScopes = "openid email profile offline_access"
				cfg.InviteExpirationHours = 24
				cfg.TokenEncryptionKey = "a-32-byte-encryption-key-padded!"
				return nil
			})
		api.On("GetConfig").Return(mmConfig)

		p := &Plugin{client: pluginapi.NewClient(api, nil)}
		p.SetAPI(api)

		err := p.OnConfigurationChange()
		assert.NoError(t, err)
		assert.Equal(t, "https://controller.example", p.getConfiguration().OpenTalkControllerURL)
		assert.NotNil(t, p.getOIDCClient(), "oidc client must be initialized after successful config change")
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
