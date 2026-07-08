package store

import (
	"encoding/json"
	"fmt"
	"time"
)

const oauthStateTTLSeconds = 600 // 10 minutes

type OAuthState struct {
	MattermostUserID string    `json:"mm_user_id"`
	PKCEVerifier     string    `json:"pkce_verifier"`
	CreatedAt        time.Time `json:"created_at"`
}

func oauthStateKey(state string) string {
	return "oauth_state_" + state
}

func (s *Store) SaveOAuthState(state, mmUserID, pkceVerifier string) error {
	payload, err := json.Marshal(OAuthState{
		MattermostUserID: mmUserID,
		PKCEVerifier:     pkceVerifier,
		CreatedAt:        time.Now().UTC(),
	})
	if err != nil {
		return fmt.Errorf("marshal OAuthState: %w", err)
	}
	return s.Set(oauthStateKey(state), payload, oauthStateTTLSeconds)
}

// ConsumeOAuthState returns the stored record and atomically deletes it.
// State is one-shot: only the first caller wins; a concurrent replay loses
// the CAS-delete and is rejected as invalid.
func (s *Store) ConsumeOAuthState(state string) (*OAuthState, error) {
	key := oauthStateKey(state)
	raw, err := s.Get(key)
	if err != nil {
		return nil, err
	}
	var os OAuthState
	if err := json.Unmarshal(raw, &os); err != nil {
		return nil, fmt.Errorf("unmarshal OAuthState: %w", err)
	}
	ok, appErr := s.api.KVCompareAndDelete(key, raw)
	if appErr != nil {
		return nil, appErr
	}
	if !ok {
		return nil, ErrNotFound
	}
	return &os, nil
}
