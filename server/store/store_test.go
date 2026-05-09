package store

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashKey_StableHash(t *testing.T) {
	h1 := hashKey("user_info_", "abc123")
	h2 := hashKey("user_info_", "abc123")
	assert.Equal(t, h1, h2, "same inputs must hash to same key")
	assert.NotEqual(t, h1, hashKey("user_info_", "abc124"))
	assert.True(t, len(h1) <= 150, "key must fit Mattermost KV-key limit (150 runes)")
}

func TestDismissalKey_FitsKVLimit(t *testing.T) {
	// Realistic worst-case: 26-char channel ID + 36-char UUID room ID + separators.
	channelID := "abcdefghijklmnopqrstuvwxyz"        // 26 chars
	roomID := "12345678-1234-1234-1234-123456789012" // 36-char UUID
	key := dismissalKey(channelID, roomID)
	assert.True(t, len(key) <= 150,
		"dismissal key length %d must fit Mattermost 150-rune KV-key limit", len(key))
}

func TestStore_GetSetDelete(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVSetWithExpiry", "test_key", []byte("hello"), int64(0)).
		Return(nil)
	api.On("KVGet", "test_key").
		Return([]byte("hello"), nil)
	api.On("KVDelete", "test_key").
		Return(nil)

	s := New(api)
	require.NoError(t, s.Set("test_key", []byte("hello"), 0))
	got, err := s.Get("test_key")
	require.NoError(t, err)
	assert.Equal(t, []byte("hello"), got)
	assert.NoError(t, s.Delete("test_key"))

	api.AssertExpectations(t)
}

func TestStore_GetMissingReturnsNotFound(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", "missing").Return([]byte(nil), nil)
	s := New(api)
	_, err := s.Get("missing")
	assert.ErrorIs(t, err, ErrNotFound)
}
