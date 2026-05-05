package store

import (
	"encoding/json"
	"fmt"
	"time"
)

const oauthStateTTLSeconds = 600 // 10 minutes

type OAuthState struct {
	MattermostUserID string    `json:"mm_user_id"`
	CreatedAt        time.Time `json:"created_at"`
}

func oauthStateKey(state string) string {
	return "oauth_state_" + state
}

func (s *Store) SaveOAuthState(state, mmUserID string) error {
	payload, err := json.Marshal(OAuthState{
		MattermostUserID: mmUserID,
		CreatedAt:        time.Now().UTC(),
	})
	if err != nil {
		return fmt.Errorf("marshal OAuthState: %w", err)
	}
	return s.Set(oauthStateKey(state), payload, oauthStateTTLSeconds)
}

// ConsumeOAuthState returns the stored MM-User-ID and deletes the state record
// in a single call. State is one-shot: a replayed callback won't authenticate.
func (s *Store) ConsumeOAuthState(state string) (string, error) {
	raw, err := s.Get(oauthStateKey(state))
	if err != nil {
		return "", err
	}
	var os OAuthState
	if err := json.Unmarshal(raw, &os); err != nil {
		return "", fmt.Errorf("unmarshal OAuthState: %w", err)
	}
	if err := s.Delete(oauthStateKey(state)); err != nil {
		return os.MattermostUserID, fmt.Errorf("delete OAuthState: %w", err)
	}
	return os.MattermostUserID, nil
}
