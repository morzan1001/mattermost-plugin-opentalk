package oidc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockOIDCServer spins up a minimal OIDC IdP for tests:
// /.well-known/openid-configuration, /token, /userinfo, /jwks.
// The returned url.Values captures the form of the last /token request.
// An optional tokenResp overrides the default /token JSON body.
func mockOIDCServer(t *testing.T, tokenResp ...map[string]any) (*httptest.Server, *url.Values) {
	t.Helper()
	token := map[string]any{
		"access_token":  "access-jwt",
		"refresh_token": "refresh-jwt",
		"token_type":    "Bearer",
		"expires_in":    300,
	}
	if len(tokenResp) > 0 {
		token = tokenResp[0]
	}
	tokenForm := &url.Values{}
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
			_ = r.ParseForm()
			*tokenForm = r.PostForm
			json.NewEncoder(w).Encode(token)
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
	return srv, tokenForm
}

func newTestClient(t *testing.T, srv *httptest.Server) *Client {
	t.Helper()
	c, err := NewClient(context.Background(), Config{
		Issuer:       srv.URL,
		ClientID:     "test-client",
		ClientSecret: "test-secret",
		RedirectURL:  "http://localhost:8065/plugins/com.github.morzan1001.mattermost-plugin-opentalk/oauth/callback",
		Scopes:       []string{"openid", "email", "profile", "offline_access"},
	})
	require.NoError(t, err)
	return c
}

func TestNewClient_DiscoversIssuer(t *testing.T) {
	srv, _ := mockOIDCServer(t)
	defer srv.Close()
	c := newTestClient(t, srv)

	authURL := c.AuthCodeURL("state-xyz", GenerateVerifier())
	assert.Contains(t, authURL, "client_id=test-client")
	assert.Contains(t, authURL, "state=state-xyz")
	assert.Contains(t, authURL, "scope=openid+email+profile+offline_access")
	assert.Contains(t, authURL, "code_challenge=")
	assert.Contains(t, authURL, "code_challenge_method=S256")
	assert.True(t, strings.HasPrefix(authURL, srv.URL+"/auth"))
}

func TestExchange_ReturnsTokenAndUserinfo(t *testing.T) {
	srv, tokenForm := mockOIDCServer(t)
	defer srv.Close()
	c := newTestClient(t, srv)

	tok, info, err := c.Exchange(context.Background(), "auth-code-xyz", "pkce-verifier-1")
	require.NoError(t, err)
	assert.Equal(t, "access-jwt", tok.AccessToken)
	assert.Equal(t, "refresh-jwt", tok.RefreshToken)
	assert.Equal(t, "kc-sub-1", info.Sub)
	assert.Equal(t, "alice@example.com", info.Email)
	assert.Equal(t, "pkce-verifier-1", tokenForm.Get("code_verifier"))
}

func TestRefresh_ReturnsNewToken(t *testing.T) {
	srv, _ := mockOIDCServer(t)
	defer srv.Close()
	c := newTestClient(t, srv)

	tok, err := c.Refresh(context.Background(), "old-refresh-jwt")
	require.NoError(t, err)
	assert.Equal(t, "access-jwt", tok.AccessToken)
}
