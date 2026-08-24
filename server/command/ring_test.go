package command

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// expectRingtoneSave stubs the KV write ring performs and appends each stored
// value to *saved.
func expectRingtoneSave(t *testing.T, api *plugintest.API, userID string, saved *[]string) {
	t.Helper()
	api.On("KVSetWithExpiry", "ring_"+userID, mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) { *saved = append(*saved, string(args.Get(1).([]byte))) }).
		Return(nil)
}

func TestRing_On_BroadcastsEnabledTrue(t *testing.T) {
	api := &plugintest.API{}
	var saved []string
	expectRingtoneSave(t, api, "u1", &saved)
	h := newHandler(api)

	var gotEvent string
	var gotPayload map[string]any
	var gotBroadcast *model.WebsocketBroadcast
	h.Broadcaster = func(event string, payload map[string]any, b *model.WebsocketBroadcast) {
		gotEvent = event
		gotPayload = payload
		gotBroadcast = b
	}
	h.LocaleOf = func(string) string { return "en" }

	resp, appErr := h.Execute(mkArgs("u1", "/opentalk ring on"))

	require.Nil(t, appErr)
	require.NotNil(t, resp)
	assert.Equal(t, "ring_setting_changed", gotEvent)
	assert.Equal(t, "u1", gotPayload["mm_user_id"])
	assert.Equal(t, true, gotPayload["enabled"])
	assert.Equal(t, "u1", gotBroadcast.UserId, "ring setting must be user-scoped")
	assert.Contains(t, resp.Text, "Ringtone enabled")
	assert.Equal(t, []string{"true"}, saved)
}

func TestRing_Off_BroadcastsEnabledFalse(t *testing.T) {
	api := &plugintest.API{}
	var saved []string
	expectRingtoneSave(t, api, "u1", &saved)
	h := newHandler(api)

	var gotPayload map[string]any
	var gotBroadcast *model.WebsocketBroadcast
	h.Broadcaster = func(_ string, payload map[string]any, b *model.WebsocketBroadcast) {
		gotPayload = payload
		gotBroadcast = b
	}
	h.LocaleOf = func(string) string { return "en" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring off"))

	assert.Equal(t, false, gotPayload["enabled"])
	assert.Equal(t, "u1", gotPayload["mm_user_id"])
	assert.Equal(t, "u1", gotBroadcast.UserId)
	assert.Contains(t, resp.Text, "Ringtone disabled")
	assert.Equal(t, []string{"false"}, saved)
}

func TestRing_On_PersistsBeforeBroadcast(t *testing.T) {
	api := &plugintest.API{}
	var order []string
	api.On("KVSetWithExpiry", "ring_u1", mock.Anything, mock.Anything).
		Run(func(mock.Arguments) { order = append(order, "save") }).
		Return(nil)
	h := newHandler(api)
	h.Broadcaster = func(string, map[string]any, *model.WebsocketBroadcast) {
		order = append(order, "broadcast")
	}
	h.LocaleOf = func(string) string { return "en" }

	_, _ = h.Execute(mkArgs("u1", "/opentalk ring on"))

	assert.Equal(t, []string{"save", "broadcast"}, order,
		"persistence must land before the broadcast so late joiners of the event see the new value")
}

func TestRing_SaveFailure_SkipsBroadcast(t *testing.T) {
	for _, sub := range []string{"on", "off"} {
		t.Run(sub, func(t *testing.T) {
			api := &plugintest.API{}
			api.On("KVSetWithExpiry", "ring_u1", mock.Anything, mock.Anything).
				Return(&model.AppError{Message: "kv down"})
			h := newHandler(api)
			broadcasted := false
			h.Broadcaster = func(string, map[string]any, *model.WebsocketBroadcast) { broadcasted = true }
			h.LocaleOf = func(string) string { return "en" }

			resp, appErr := h.Execute(mkArgs("u1", "/opentalk ring "+sub))

			require.Nil(t, appErr)
			require.NotNil(t, resp)
			assert.False(t, broadcasted, "a failed save must not broadcast")
			assert.Contains(t, resp.Text, "Saving failed")
		})
	}
}

func TestRing_On_DE_BroadcastsAndReturnsGerman(t *testing.T) {
	api := &plugintest.API{}
	var saved []string
	expectRingtoneSave(t, api, "u2", &saved)
	h := newHandler(api)

	var gotPayload map[string]any
	h.Broadcaster = func(_ string, payload map[string]any, _ *model.WebsocketBroadcast) {
		gotPayload = payload
	}
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u2", "/opentalk ring on"))

	assert.Equal(t, true, gotPayload["enabled"])
	assert.Contains(t, resp.Text, "eingeschaltet")
	assert.Equal(t, []string{"true"}, saved)
}

func TestRing_Off_DE_ReturnsGerman(t *testing.T) {
	api := &plugintest.API{}
	var saved []string
	expectRingtoneSave(t, api, "u2", &saved)
	h := newHandler(api)
	h.Broadcaster = func(string, map[string]any, *model.WebsocketBroadcast) {}
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u2", "/opentalk ring off"))
	assert.Contains(t, resp.Text, "ausgeschaltet")
}

func TestRing_Status_NoBroadcast(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)

	broadcasted := false
	h.Broadcaster = func(string, map[string]any, *model.WebsocketBroadcast) { broadcasted = true }
	h.LocaleOf = func(string) string { return "en" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring status"))

	assert.False(t, broadcasted, "status should not broadcast")
	assert.Contains(t, resp.Text, "Ringtone status")
}

func TestRing_NoSubcommand_NoBroadcast(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)

	broadcasted := false
	h.Broadcaster = func(string, map[string]any, *model.WebsocketBroadcast) { broadcasted = true }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring"))

	assert.False(t, broadcasted)
	assert.Contains(t, resp.Text, "ring")
}

func TestRing_UnknownSubcommand_ReturnsUsageLine(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)
	h.LocaleOf = func(string) string { return "en" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring wiggle"))

	assert.Contains(t, resp.Text, "ring on|off|status")
}

func TestRing_UnknownSubcommand_DE_ReturnsGermanUsageLine(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring nope"))

	assert.Contains(t, resp.Text, "ring on|off|status")
}

func TestRing_NilBroadcaster_DoesNotPanic(t *testing.T) {
	api := &plugintest.API{}
	var saved []string
	expectRingtoneSave(t, api, "u1", &saved)
	h := newHandler(api)

	assert.NotPanics(t, func() {
		resp, _ := h.Execute(mkArgs("u1", "/opentalk ring on"))
		assert.NotNil(t, resp)
	})
}
