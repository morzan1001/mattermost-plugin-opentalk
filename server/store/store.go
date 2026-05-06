package store

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"

	"github.com/mattermost/mattermost/server/public/plugin"
)

var ErrNotFound = errors.New("key not found in store")

// hashKey derives a fixed-length, prefix-stable KV key from a free-form
// identifier. 16 hex chars of SHA-256 keep the key well below Mattermost's
// 50-byte KV-key limit.
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

// PurgeKeysWithPrefix iterates all KV keys for the plugin and deletes those
// that start with the given prefix. Used by Plugin.OnActivate to drop stale
// runtime state (active meetings, dismissals) left over from a previous
// deploy so a brand-new plugin process never inherits ringing-call state
// it cannot reconcile. Returns the count of deleted keys.
func (s *Store) PurgeKeysWithPrefix(prefix string) (int, error) {
	deleted := 0
	page := 0
	const perPage = 200
	for {
		keys, appErr := s.api.KVList(page, perPage)
		if appErr != nil {
			return deleted, appErr
		}
		if len(keys) == 0 {
			break
		}
		for _, k := range keys {
			if strings.HasPrefix(k, prefix) {
				if dErr := s.api.KVDelete(k); dErr == nil {
					deleted++
				}
			}
		}
		if len(keys) < perPage {
			break
		}
		page++
	}
	return deleted, nil
}
