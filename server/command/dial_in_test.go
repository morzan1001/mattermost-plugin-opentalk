package command

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func activeMeetingJSON(t *testing.T, am *store.ActiveMeeting) []byte {
	t.Helper()
	raw, err := json.Marshal(am)
	require.NoError(t, err)
	return raw
}

func TestDialIn_NoActiveMeeting(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)
	h := newHandler(api)
	resp, _ := h.Execute(&model.CommandArgs{UserId: "u", ChannelId: "ch", Command: "/opentalk dial-in"})
	assert.Contains(t, resp.Text, "kein aktives Meeting")
}

func TestDialIn_ShowsSIPInfo(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:    "ch",
		EnableSIP:    true,
		DialInNumber: "+49 30 555 1234",
		DialInPIN:    "4242",
		CreatedAt:    time.Now().UTC(),
	}
	api.On("KVGet", mock.AnythingOfType("string")).Return(activeMeetingJSON(t, am), nil)
	h := newHandler(api)
	resp, _ := h.Execute(&model.CommandArgs{UserId: "u", ChannelId: "ch", Command: "/opentalk dial-in"})
	assert.Contains(t, resp.Text, "+49 30 555 1234")
	assert.Contains(t, resp.Text, "4242")
}

func TestDialIn_NoSIPHint(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{ChannelID: "ch", EnableSIP: false, CreatedAt: time.Now()}
	api.On("KVGet", mock.AnythingOfType("string")).Return(activeMeetingJSON(t, am), nil)
	h := newHandler(api)
	resp, _ := h.Execute(&model.CommandArgs{UserId: "u", ChannelId: "ch", Command: "/opentalk dial-in"})
	assert.Contains(t, resp.Text, "kein SIP")
}
