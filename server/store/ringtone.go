package store

import (
	"encoding/json"
	"errors"
	"fmt"
)

func ringtoneKey(mmUserID string) string {
	return "ring_" + mmUserID
}

// LoadRingtone returns nil (with no error) when the user never saved a
// preference, so callers can distinguish "unset" from an explicit false and
// let the webapp default apply.
func (s *Store) LoadRingtone(mmUserID string) (*bool, error) {
	raw, err := s.Get(ringtoneKey(mmUserID))
	if errors.Is(err, ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var enabled bool
	if err := json.Unmarshal(raw, &enabled); err != nil {
		return nil, fmt.Errorf("unmarshal ringtone: %w", err)
	}
	return &enabled, nil
}

// SaveRingtone persists the ringtone preference as a plain JSON boolean.
// The value is not encrypted or TTL-bound: it is not a secret, and the user
// may be offline for arbitrary spans between toggles.
func (s *Store) SaveRingtone(mmUserID string, enabled bool) error {
	raw, err := json.Marshal(enabled)
	if err != nil {
		return fmt.Errorf("marshal ringtone: %w", err)
	}
	return s.Set(ringtoneKey(mmUserID), raw, 0)
}
