package store

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testKey = []byte("0123456789abcdef0123456789abcdef")

func TestUserInfo_RoundTrip(t *testing.T) {
	api := &plugintest.API{}
	s := New(api)

	info := &UserInfo{
		MattermostUserID: "mm-user-id-1",
		OpenTalkSub:      "kc-sub-xyz",
		OpenTalkEmail:    "alice@example.com",
		AccessToken:      "access-jwt",
		RefreshToken:     "refresh-jwt",
		AccessExpiry:     time.Now().Add(5 * time.Minute).UTC().Round(time.Second),
		ConnectedAt:      time.Now().UTC().Round(time.Second),
	}

	var stored []byte
	api.On("KVSetWithExpiry",
		userInfoKey("mm-user-id-1"),
		mock.Anything, int64(0)).
		Run(func(args mock.Arguments) { stored = args.Get(1).([]byte) }).
		Return(nil)

	require.NoError(t, s.SaveUserInfo(testKey, info))
	assert.NotEmpty(t, stored)
	assert.NotContains(t, string(stored), "refresh-jwt", "tokens must be encrypted at rest")

	api.On("KVGet", userInfoKey("mm-user-id-1")).
		Return(stored, nil)

	got, err := s.LoadUserInfo(testKey, "mm-user-id-1")
	require.NoError(t, err)
	assert.Equal(t, info.MattermostUserID, got.MattermostUserID)
	assert.Equal(t, info.OpenTalkSub, got.OpenTalkSub)
	assert.Equal(t, info.AccessToken, got.AccessToken)
	assert.Equal(t, info.RefreshToken, got.RefreshToken)
	assert.WithinDuration(t, info.AccessExpiry, got.AccessExpiry, time.Second)
}

func TestUserInfo_LoadMissingReturnsNotFound(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", userInfoKey("absent")).Return([]byte(nil), nil)

	s := New(api)
	_, err := s.LoadUserInfo(testKey, "absent")
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestUserInfo_DeleteUserInfo(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVDelete", userInfoKey("mm-user")).Return(nil)

	s := New(api)
	require.NoError(t, s.DeleteUserInfo("mm-user"))
	api.AssertExpectations(t)
}
