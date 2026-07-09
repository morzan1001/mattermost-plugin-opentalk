package oidc

import (
	"context"
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
	srv, _ := mockOIDCServer(t, map[string]any{
		"access_token":  "fresh-jwt",
		"refresh_token": "rotated-refresh-jwt",
		"token_type":    "Bearer",
		"expires_in":    300,
	})
	defer srv.Close()

	client := newTestClient(t, srv)

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
	srv, _ := mockOIDCServer(t, map[string]any{
		"access_token": "fresh-jwt", "token_type": "Bearer", "expires_in": 300,
	})
	defer srv.Close()

	client := newTestClient(t, srv)

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
