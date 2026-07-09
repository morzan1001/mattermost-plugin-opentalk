package store

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"

	"github.com/mattermost/mattermost/server/public/plugin"
)

var ErrNotFound = errors.New("key not found in store")

// hashKey derives a fixed-length, prefix-stable KV key from a free-form
// identifier. 16 hex chars of SHA-256 keep the key well below Mattermost's
// 150-rune KV-key limit (model.KeyValueKeyMaxRunes = 150).
func hashKey(prefix, id string) string {
	sum := sha256.Sum256([]byte(id))
	return prefix + hex.EncodeToString(sum[:8])
}

type Store struct {
	api plugin.API
}

func New(api plugin.API) *Store {
	return &Store{api: api}
}

func (s *Store) Set(key string, value []byte, expirySeconds int64) error {
	if appErr := s.api.KVSetWithExpiry(key, value, expirySeconds); appErr != nil {
		return appErr
	}
	return nil
}

func (s *Store) Get(key string) ([]byte, error) {
	value, appErr := s.api.KVGet(key)
	if appErr != nil {
		return nil, appErr
	}
	if value == nil {
		return nil, ErrNotFound
	}
	return value, nil
}

func (s *Store) Delete(key string) error {
	if appErr := s.api.KVDelete(key); appErr != nil {
		return appErr
	}
	return nil
}
