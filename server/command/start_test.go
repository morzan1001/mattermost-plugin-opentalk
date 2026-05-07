package command

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/crypto"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// connectedUserInfoBytes returns AES-GCM-encrypted UserInfo so that
// h.Store.LoadUserInfo returns a non-ErrNotFound result.
func connectedUserInfoBytes(t *testing.T) []byte {
	t.Helper()
	info := &store.UserInfo{
		MattermostUserID: "u1",
		AccessToken:      "tok",
		RefreshToken:     "rt",
		AccessExpiry:     time.Now().Add(time.Hour),
	}
	raw, err := json.Marshal(info)
	require.NoError(t, err)
	enc, err := crypto.Encrypt(encKey, raw)
	require.NoError(t, err)
	return enc
}

func TestStart_NoticesNotConnected(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)
	h := newHandler(api)
	resp, _ := h.Execute(&model.CommandArgs{UserId: "u1", ChannelId: "ch", Command: "/opentalk start"})
	assert.Contains(t, resp.Text, "/opentalk connect")
}

func TestStart_CreatesMeeting(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return(connectedUserInfoBytes(t), nil)

	var capturedChannel, capturedHost string
	h := newHandler(api)
	h.MeetingCreator = func(channelID, hostUserID string) (*store.ActiveMeeting, error) {
		capturedChannel = channelID
		capturedHost = hostUserID
		return &store.ActiveMeeting{RoomID: "room-1", InviteCode: "inv-1"}, nil
	}

	resp, _ := h.Execute(&model.CommandArgs{UserId: "u1", ChannelId: "ch-7", Command: "/opentalk start"})
	assert.Contains(t, resp.Text, "Meeting gestartet")
	assert.Contains(t, resp.Text, "room-1")
	assert.Equal(t, "ch-7", capturedChannel)
	assert.Equal(t, "u1", capturedHost)
}

func TestStart_PropagatesCreationError(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return(connectedUserInfoBytes(t), nil)

	h := newHandler(api)
	h.MeetingCreator = func(string, string) (*store.ActiveMeeting, error) {
		return nil, errors.New("create-room failed")
	}
	resp, _ := h.Execute(&model.CommandArgs{UserId: "u1", ChannelId: "ch", Command: "/opentalk start"})
	assert.Contains(t, resp.Text, "konnte nicht erstellt werden")
}
