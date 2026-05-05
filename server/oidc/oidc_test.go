package oidc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockOIDCServer spins up a minimal OIDC IdP for tests:
// /.well-known/openid-configuration, /token, /userinfo, /jwks.
func mockOIDCServer(t *testing.T) *httptest.Server {
	t.Helper()
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		default:
			http.NotFound(w, r)
		}
	}))
	return srv
}

func newTestClient(t *testing.T, srv *httptest.Server) *Client {
	t.Helper()
	c, err := NewClient(context.Background(), Config{
		Issuer:       srv.URL,
		ClientID:     "test-client",
		ClientSecret: "test-secret",
		RedirectURL:  "http://localhost:8065/plugins/de.opentalk.mattermost-plugin/oauth/callback",
		Scopes:       []string{"openid", "email", "profile", "offline_access"},
	})
	require.NoError(t, err)
	return c
}

func TestNewClient_DiscoversIssuer(t *testing.T) {
	srv := mockOIDCServer(t)
	defer srv.Close()
	c := newTestClient(t, srv)

	url := c.AuthCodeURL("state-xyz")
	assert.Contains(t, url, "client_id=test-client")
	assert.Contains(t, url, "state=state-xyz")
	assert.Contains(t, url, "scope=openid+email+profile+offline_access")
	assert.True(t, strings.HasPrefix(url, srv.URL+"/auth"))
}

func TestExchange_ReturnsTokenAndUserinfo(t *testing.T) {
	srv := mockOIDCServer(t)
	defer srv.Close()
	c := newTestClient(t, srv)

	tok, info, err := c.Exchange(context.Background(), "auth-code-xyz")
	require.NoError(t, err)
	assert.Equal(t, "access-jwt", tok.AccessToken)
	assert.Equal(t, "refresh-jwt", tok.RefreshToken)
	assert.Equal(t, "kc-sub-1", info.Sub)
	assert.Equal(t, "alice@example.com", info.Email)
}

func TestRefresh_ReturnsNewToken(t *testing.T) {
	srv := mockOIDCServer(t)
	defer srv.Close()
	c := newTestClient(t, srv)

	tok, err := c.Refresh(context.Background(), "old-refresh-jwt")
	require.NoError(t, err)
	assert.Equal(t, "access-jwt", tok.AccessToken)
}
