package store

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestActiveMeeting_RoundTrip(t *testing.T) {
	api := &plugintest.API{}
	s := New(api)

	am := &ActiveMeeting{
		ChannelID:     "ch-1",
		RoomID:        "room-1",
		InviteCode:    "inv-1",
		HostUserID:    "mm-host-1",
		PostID:        "post-1",
		CreatedAt:     time.Now().UTC().Round(time.Second),
		LastHeartbeat: time.Now().UTC().Round(time.Second),
		EnableSIP:     true,
		DialInNumber:  "+49 30 123",
		DialInPIN:     "4242",
	}

	var stored []byte
	api.On("KVSetWithExpiry", meetingKey("ch-1"), mock.Anything, int64(0)).
		Run(func(args mock.Arguments) { stored = args.Get(1).([]byte) }).
		Return(nil)
	require.NoError(t, s.SaveActiveMeeting(am))
	assert.NotEmpty(t, stored)

	api.On("KVGet", meetingKey("ch-1")).Return(stored, nil)
	got, err := s.LoadActiveMeeting("ch-1")
	require.NoError(t, err)
	assert.Equal(t, am.RoomID, got.RoomID)
	assert.Equal(t, am.HostUserID, got.HostUserID)
	assert.True(t, got.EnableSIP)
	assert.Equal(t, am.DialInPIN, got.DialInPIN)
}

func TestActiveMeeting_LoadMissingReturnsNotFound(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", meetingKey("ch-x")).Return([]byte(nil), nil)

	s := New(api)
	_, err := s.LoadActiveMeeting("ch-x")
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestActiveMeeting_Delete(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVDelete", meetingKey("ch-1")).Return(nil)

	s := New(api)
	require.NoError(t, s.DeleteActiveMeeting("ch-1"))
	api.AssertExpectations(t)
}
