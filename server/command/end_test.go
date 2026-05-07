package command

import (
	"errors"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func TestEnd_NoActiveMeeting(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)
	h := newHandler(api)
	resp, _ := h.Execute(&model.CommandArgs{UserId: "u", ChannelId: "ch", Command: "/opentalk end"})
	assert.Contains(t, resp.Text, "no active meeting")
}

func TestEnd_NonHostRejected(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "ch",
		HostUserID: "host-u",
		RoomID:     "room-1",
		PostID:     "post-1",
		CreatedAt:  time.Now().UTC(),
	}
	api.On("KVGet", mock.AnythingOfType("string")).Return(activeMeetingJSON(t, am), nil)
	h := newHandler(api)
	resp, _ := h.Execute(&model.CommandArgs{UserId: "not-host", ChannelId: "ch", Command: "/opentalk end"})
	assert.Contains(t, resp.Text, "Only the host")
}

func TestEnd_HostUpdatesPostAndDeletesMeeting(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "ch",
		HostUserID: "host-u",
		RoomID:     "room-1",
		InviteCode: "inv-1",
		PostID:     "post-1",
		CreatedAt:  time.Now().Add(-5 * time.Minute).UTC(),
	}
	api.On("KVGet", mock.AnythingOfType("string")).Return(activeMeetingJSON(t, am), nil)
	api.On("KVDelete", mock.AnythingOfType("string")).Return(nil)

	var updated *model.Post
	var brEvent string
	var brPayload map[string]any

	h := newHandler(api)
	h.PostGetter = func(postID string) (*model.Post, error) {
		return &model.Post{
			Id:    postID,
			Type:  "custom_opentalk_meeting",
			Props: model.StringInterface{"status": "STARTED", "started_at": int64(time.Now().Add(-5 * time.Minute).Unix())},
		}, nil
	}
	h.PostUpdater = func(p *model.Post) error {
		updated = p
		return nil
	}
	h.Broadcaster = func(event string, payload map[string]any) {
		brEvent = event
		brPayload = payload
	}

	resp, _ := h.Execute(&model.CommandArgs{UserId: "host-u", ChannelId: "ch", Command: "/opentalk end"})
	assert.Contains(t, resp.Text, "ended")
	assert.NotNil(t, updated, "post update expected")
	assert.Equal(t, "ENDED", updated.GetProp("status"))
	assert.Equal(t, "meeting_ended", brEvent)
	assert.Equal(t, "ch", brPayload["channel_id"])
	assert.Equal(t, "room-1", brPayload["room_id"])
	api.AssertExpectations(t)
}

func TestEnd_PostUpdateFailureStillDeletesMeeting(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "ch",
		HostUserID: "host-u",
		RoomID:     "room-1",
		PostID:     "post-1",
		CreatedAt:  time.Now().UTC(),
	}
	api.On("KVGet", mock.AnythingOfType("string")).Return(activeMeetingJSON(t, am), nil)
	api.On("KVDelete", mock.AnythingOfType("string")).Return(nil)
	api.On("LogWarn", mock.AnythingOfType("string"), mock.Anything, mock.Anything).Return()

	h := newHandler(api)
	h.PostGetter = func(string) (*model.Post, error) {
		return &model.Post{Id: "post-1", Props: model.StringInterface{}}, nil
	}
	h.PostUpdater = func(*model.Post) error { return errors.New("update failed") }

	resp, _ := h.Execute(&model.CommandArgs{UserId: "host-u", ChannelId: "ch", Command: "/opentalk end"})
	assert.Contains(t, resp.Text, "ended")
}
