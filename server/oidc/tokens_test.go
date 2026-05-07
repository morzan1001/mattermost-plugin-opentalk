package oidc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func TestEnsureFreshToken_ReturnsExistingIfNotExpired(t *testing.T) {
	info := &store.UserInfo{
		AccessToken:  "still-valid",
		RefreshToken: "rt",
		AccessExpiry: time.Now().Add(2 * time.Minute),
	}

	fresh, err := EnsureFreshToken(context.Background(), nil /*client unused*/, info)
	require.NoError(t, err)
	assert.Equal(t, "still-valid", fresh.AccessToken)
	assert.Equal(t, info.AccessExpiry, fresh.AccessExpiry)
}

func TestEnsureFreshToken_RefreshesIfExpired(t *testing.T) {
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
				"access_token":  "fresh-jwt",
				"refresh_token": "rotated-refresh-jwt",
				"token_type":    "Bearer",
				"expires_in":    300,
			})
		case "/userinfo":
			json.NewEncoder(w).Encode(map[string]string{"sub": "x", "email": "y"})
		case "/jwks":
			json.NewEncoder(w).Encode(map[string]any{"keys": []any{}})
		}
	}))
	defer srv.Close()

	client, err := NewClient(context.Background(), Config{
		Issuer: srv.URL, ClientID: "id", ClientSecret: "secret",
		RedirectURL: "http://localhost/callback",
		Scopes:      []string{"openid"},
	})
	require.NoError(t, err)

	info := &store.UserInfo{
		AccessToken:  "expired",
		RefreshToken: "old-refresh-jwt",
		AccessExpiry: time.Now().Add(-1 * time.Minute),
	}

	fresh, err := EnsureFreshToken(context.Background(), client, info)
	require.NoError(t, err)
	assert.Equal(t, "fresh-jwt", fresh.AccessToken)
	assert.Equal(t, "rotated-refresh-jwt", fresh.RefreshToken)
	assert.True(t, fresh.AccessExpiry.After(time.Now()))
	// Original info must not be mutated.
	assert.Equal(t, "expired", info.AccessToken)
}

func TestEnsureFreshToken_RefreshesEagerlyWithinLeeway(t *testing.T) {
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
				"access_token": "fresh-jwt", "token_type": "Bearer", "expires_in": 300,
			})
		case "/jwks":
			json.NewEncoder(w).Encode(map[string]any{"keys": []any{}})
		}
	}))
	defer srv.Close()

	client, err := NewClient(context.Background(), Config{
		Issuer: srv.URL, ClientID: "id", ClientSecret: "secret",
		RedirectURL: "http://localhost/callback", Scopes: []string{"openid"},
	})
	require.NoError(t, err)

	// 10 seconds away from expiry — within 30s leeway, must refresh.
	info := &store.UserInfo{
		AccessToken:  "almost-expired",
		RefreshToken: "rt",
		AccessExpiry: time.Now().Add(10 * time.Second),
	}

	fresh, err := EnsureFreshToken(context.Background(), client, info)
	require.NoError(t, err)
	assert.Equal(t, "fresh-jwt", fresh.AccessToken)
}

func TestEnsureFreshToken_NoClientWhenExpiredErrors(t *testing.T) {
	info := &store.UserInfo{
		AccessToken:  "expired",
		RefreshToken: "rt",
		AccessExpiry: time.Now().Add(-1 * time.Minute),
	}
	_, err := EnsureFreshToken(context.Background(), nil, info)
	assert.Error(t, err)
}
