package http

import (
	"context"
	"encoding/json"
	nethttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/opentalk/mattermost-plugin-opentalk/server/oidc"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

// stubOIDCClient spins up a minimal OIDC IdP and returns a real *oidc.Client
// pointed at it. The IdP doesn't issue tokens here — Task 8 only needs
// AuthCodeURL.
func stubOIDCClient(t *testing.T) *oidc.Client {
	t.Helper()
	var srv *httptest.Server
	srv = httptest.NewServer(nethttp.HandlerFunc(func(w nethttp.ResponseWriter, r *nethttp.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/.well-known/openid-configuration" {
			json.NewEncoder(w).Encode(map[string]any{
				"issuer":                                srv.URL,
				"authorization_endpoint":                srv.URL + "/auth",
				"token_endpoint":                        srv.URL + "/token",
				"userinfo_endpoint":                     srv.URL + "/userinfo",
				"jwks_uri":                              srv.URL + "/jwks",
				"id_token_signing_alg_values_supported": []string{"RS256"},
			})
		}
	}))
	t.Cleanup(srv.Close)
	c, err := oidc.NewClient(context.Background(), oidc.Config{
		Issuer:       srv.URL,
		ClientID:     "test-client",
		ClientSecret: "test-secret",
		RedirectURL:  "http://localhost:8065/plugins/de.opentalk.mattermost-plugin/oauth/callback",
		Scopes:       []string{"openid", "email", "profile", "offline_access"},
	})
	require.NoError(t, err)
	return c
}

func TestOAuthStart_RedirectsAndStoresState(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVSetWithExpiry", mock.AnythingOfType("string"), mock.Anything, int64(600)).Return(nil)

	h := &Handlers{
		Store: store.New(api),
		OIDC:  stubOIDCClient(t),
	}

	req := httptest.NewRequest(nethttp.MethodGet, "/oauth/start", nil)
	req.Header.Set("Mattermost-User-ID", "mm-user-1")
	rr := httptest.NewRecorder()
	h.OAuthStart(rr, req)

	require.Equal(t, nethttp.StatusFound, rr.Code)
	location := rr.Header().Get("Location")
	assert.True(t, strings.Contains(location, "/auth"), "redirect to authorization endpoint")
	assert.Contains(t, location, "state=")
	assert.Contains(t, location, "client_id=test-client")
}

func TestOAuthStart_RejectsMissingUserHeader(t *testing.T) {
	api := &plugintest.API{}
	h := &Handlers{Store: store.New(api), OIDC: stubOIDCClient(t)}
	req := httptest.NewRequest(nethttp.MethodGet, "/oauth/start", nil)
	rr := httptest.NewRecorder()
	h.OAuthStart(rr, req)
	assert.Equal(t, nethttp.StatusUnauthorized, rr.Code)
}

// stubOIDCFullClient also serves /token + /userinfo so Exchange works.
func stubOIDCFullClient(t *testing.T) *oidc.Client {
	t.Helper()
	var srv *httptest.Server
	srv = httptest.NewServer(nethttp.HandlerFunc(func(w nethttp.ResponseWriter, r *nethttp.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			json.NewEncoder(w).Encode(map[string]any{
				"issuer":                                srv.URL,
				"authorization_endpoint":                srv.URL + "/auth",
				"token_endpoint":                        srv.URL + "/token",
				"userinfo_endpoint":                     srv.URL + "/userinfo",
				"jwks_uri":                              srv.URL + "/jwks",
				"id_token_signing_alg_values_supported": []string{"RS256"},
			})
		case "/token":
			json.NewEncoder(w).Encode(map[string]any{
				"access_token":  "access-jwt",
				"refresh_token": "refresh-jwt",
				"token_type":    "Bearer",
				"expires_in":    300,
			})
		case "/userinfo":
			json.NewEncoder(w).Encode(map[string]string{
				"sub":   "kc-sub-1",
				"email": "alice@example.com",
				"name":  "Alice Tester",
			})
		case "/jwks":
			json.NewEncoder(w).Encode(map[string]any{"keys": []any{}})
		}
	}))
	t.Cleanup(srv.Close)
	c, err := oidc.NewClient(context.Background(), oidc.Config{
		Issuer:       srv.URL,
		ClientID:     "test-client",
		ClientSecret: "test-secret",
		RedirectURL:  "http://localhost:8065/plugins/de.opentalk.mattermost-plugin/oauth/callback",
		Scopes:       []string{"openid", "email", "profile", "offline_access"},
	})
	require.NoError(t, err)
	return c
}

func TestOAuthCallback_ExchangesAndStoresUserInfo(t *testing.T) {
	api := &plugintest.API{}
	state := "state-xyz"
	statePayload := []byte(`{"mm_user_id":"mm-user-1","created_at":"2026-05-05T12:00:00Z"}`)

	api.On("KVGet", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "oauth_state_")
	})).Return(statePayload, nil)
	api.On("KVDelete", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "oauth_state_")
	})).Return(nil)

	var savedKey string
	var savedValue []byte
	api.On("KVSetWithExpiry",
		mock.MatchedBy(func(k string) bool { return strings.HasPrefix(k, "user_info_") }),
		mock.Anything, int64(0)).
		Run(func(args mock.Arguments) {
			savedKey = args.String(0)
			savedValue = args.Get(1).([]byte)
		}).
		Return(nil)

	var broadcastedEvent string
	var broadcastedPayload map[string]any
	h := &Handlers{
		Store:         store.New(api),
		OIDC:          stubOIDCFullClient(t),
		EncryptionKey: []byte("0123456789abcdef0123456789abcdef"),
		BroadcastFunc: func(event string, payload map[string]any) {
			broadcastedEvent = event
			broadcastedPayload = payload
		},
	}

	req := httptest.NewRequest(nethttp.MethodGet, "/oauth/callback?code=auth-code&state="+state, nil)
	rr := httptest.NewRecorder()
	h.OAuthCallback(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "Verbunden")
	assert.True(t, strings.HasPrefix(savedKey, "user_info_"))
	assert.NotEmpty(t, savedValue)
	assert.NotContains(t, string(savedValue), "refresh-jwt", "tokens must be encrypted at rest")

	require.Equal(t, "user_connected_state", broadcastedEvent)
	assert.Equal(t, "mm-user-1", broadcastedPayload["mm_user_id"])
	assert.Equal(t, true, broadcastedPayload["connected"])
	assert.Equal(t, "alice@example.com", broadcastedPayload["email"])
	_ = time.Second // keep import
}

func TestOAuthCallback_RejectsMissingStateOrCode(t *testing.T) {
	h := &Handlers{Store: store.New(&plugintest.API{}), OIDC: stubOIDCFullClient(t)}
	req := httptest.NewRequest(nethttp.MethodGet, "/oauth/callback?code=&state=", nil)
	rr := httptest.NewRecorder()
	h.OAuthCallback(rr, req)
	assert.Equal(t, nethttp.StatusBadRequest, rr.Code)
}

func TestOAuthCallback_RejectsUnknownState(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	h := &Handlers{Store: store.New(api), OIDC: stubOIDCFullClient(t)}
	req := httptest.NewRequest(nethttp.MethodGet, "/oauth/callback?code=c&state=unknown", nil)
	rr := httptest.NewRecorder()
	h.OAuthCallback(rr, req)
	assert.Equal(t, nethttp.StatusBadRequest, rr.Code)
}
