package store

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOAuthState_StoreAndConsume(t *testing.T) {
	api := &plugintest.API{}
	var stored []byte
	api.On("KVSetWithExpiry", oauthStateKey("uuid-1"), mock.Anything, int64(600)).
		Run(func(args mock.Arguments) { stored = args.Get(1).([]byte) }).
		Return(nil)

	s := New(api)
	require.NoError(t, s.SaveOAuthState("uuid-1", "mm-user-1", "pkce-verifier-1"))

	api.On("KVGet", oauthStateKey("uuid-1")).Return(stored, nil)
	api.On("KVCompareAndDelete", oauthStateKey("uuid-1"), mock.Anything).Return(true, nil)

	st, err := s.ConsumeOAuthState("uuid-1")
	require.NoError(t, err)
	assert.Equal(t, "mm-user-1", st.MattermostUserID)
	assert.Equal(t, "pkce-verifier-1", st.PKCEVerifier)
	api.AssertExpectations(t)
}

func TestOAuthState_ConcurrentConsumeLosesCAS(t *testing.T) {
	api := &plugintest.API{}
	stored := []byte(`{"mm_user_id":"mm-user-1"}`)
	api.On("KVGet", oauthStateKey("uuid-2")).Return(stored, nil)
	api.On("KVCompareAndDelete", oauthStateKey("uuid-2"), mock.Anything).Return(false, nil)

	s := New(api)
	_, err := s.ConsumeOAuthState("uuid-2")
	assert.ErrorIs(t, err, ErrNotFound, "concurrent replay must be rejected as invalid")
}

func TestOAuthState_ConsumeMissingErrors(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", oauthStateKey("absent")).Return([]byte(nil), nil)

	s := New(api)
	_, err := s.ConsumeOAuthState("absent")
	assert.ErrorIs(t, err, ErrNotFound)
}
