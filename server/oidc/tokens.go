package oidc

import (
	"context"
	"fmt"
	"time"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// refreshLeeway is how early we proactively refresh before expiry to avoid
// edge-of-window failures.
const refreshLeeway = 30 * time.Second

// EnsureFreshToken returns the existing access token if it is still valid,
// otherwise refreshes via the OIDC client and returns a new UserInfo.
// The original UserInfo is never mutated; the caller is responsible for
// persisting the returned UserInfo when refresh happened.
func EnsureFreshToken(ctx context.Context, client *Client, info *store.UserInfo) (*store.UserInfo, error) {
	if time.Now().Add(refreshLeeway).Before(info.AccessExpiry) {
		return info, nil
	}
	if client == nil {
		return nil, fmt.Errorf("token expired and no client available to refresh")
	}
	tok, err := client.Refresh(ctx, info.RefreshToken)
	if err != nil {
		return nil, fmt.Errorf("refresh token: %w", err)
	}
	refreshed := *info
	refreshed.AccessToken = tok.AccessToken
	refreshed.AccessExpiry = tok.Expiry
	if tok.RefreshToken != "" {
		refreshed.RefreshToken = tok.RefreshToken
	}
	return &refreshed, nil
}
