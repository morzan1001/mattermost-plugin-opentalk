package store

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRingtone_RoundTrip(t *testing.T) {
	for _, enabled := range []bool{true, false} {
		api := &plugintest.API{}
		s := New(api)

		var stored []byte
		api.On("KVSetWithExpiry",
			ringtoneKey("u1"),
			mock.Anything, int64(0)).
			Run(func(args mock.Arguments) { stored = args.Get(1).([]byte) }).
			Return(nil)

		require.NoError(t, s.SaveRingtone("u1", enabled))
		assert.Equal(t, map[bool]string{true: "true", false: "false"}[enabled], string(stored),
			"preference is a plain JSON boolean, not encrypted")

		api.On("KVGet", ringtoneKey("u1")).Return(stored, nil)
		got, err := s.LoadRingtone("u1")
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, enabled, *got)
	}
}

func TestRingtone_LoadMissingReturnsNil(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", ringtoneKey("absent")).Return([]byte(nil), nil)

	s := New(api)
	got, err := s.LoadRingtone("absent")
	require.NoError(t, err)
	assert.Nil(t, got, "nil means unset so the webapp default applies")
}

func TestRingtone_LoadCorruptValueErrors(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", ringtoneKey("u1")).Return([]byte("{not json"), nil)

	s := New(api)
	got, err := s.LoadRingtone("u1")
	require.Error(t, err)
	assert.Nil(t, got)
}
