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

// ConsumeOAuthState returns the stored MM-User-ID and atomically deletes the
// state record. State is one-shot: only the first caller wins; a concurrent
// replay loses the CAS-delete and is rejected as invalid.
func (s *Store) ConsumeOAuthState(state string) (string, error) {
	key := oauthStateKey(state)
	raw, err := s.Get(key)
	if err != nil {
		return "", err
	}
	var os OAuthState
	if err := json.Unmarshal(raw, &os); err != nil {
		return "", fmt.Errorf("unmarshal OAuthState: %w", err)
	}
	ok, appErr := s.api.KVCompareAndDelete(key, raw)
	if appErr != nil {
		return "", appErr
	}
	if !ok {
		return "", ErrNotFound
	}
	return os.MattermostUserID, nil
}
