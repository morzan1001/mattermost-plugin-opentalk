package command

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"

	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

func TestJoin_NoActiveMeeting(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)
	h := newHandler(api)
	resp, _ := h.Execute(&model.CommandArgs{UserId: "u", ChannelId: "ch", Command: "/opentalk join"})
	assert.Contains(t, resp.Text, "kein aktives Meeting")
}

func TestJoin_PrintsInviteURL(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "ch",
		InviteCode: "inv-9",
		CreatedAt:  time.Now(),
	}
	api.On("KVGet", mock.AnythingOfType("string")).Return(activeMeetingJSON(t, am), nil)

	h := newHandler(api)
	h.FrontendURL = "https://opentalk.example"

	resp, _ := h.Execute(&model.CommandArgs{UserId: "u", ChannelId: "ch", Command: "/opentalk join"})
	assert.Contains(t, resp.Text, "https://opentalk.example/invite/inv-9")
}
