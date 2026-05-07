package command

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
)

// TestDisconnect_DeletesUserInfoAndBroadcasts is the happy-path test.
// It verifies:
//   - KVDelete is called with the hashed user-info key
//   - PublishWebSocketEvent is called with event "user_connected_state"
//     and a payload containing mm_user_id + connected:false
//   - The ephemeral response contains the locale-appropriate confirmation text
func TestDisconnect_DeletesUserInfoAndBroadcasts(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVDelete", mock.AnythingOfType("string")).Return(nil)
	api.On("PublishWebSocketEvent",
		"user_connected_state",
		mock.MatchedBy(func(p map[string]any) bool {
			return p["connected"] == false && p["mm_user_id"] == "u1"
		}),
		mock.AnythingOfType("*model.WebsocketBroadcast"),
	).Return()

	h := newHandler(api)
	resp, appErr := h.Execute(mkArgs("u1", "/opentalk disconnect"))

	assert.Nil(t, appErr)
	assert.NotNil(t, resp)
	// Default locale is EN (no LocaleOf set → localeOf returns "").
	assert.Contains(t, resp.Text, "removed")
	api.AssertExpectations(t)
}

// TestDisconnect_DE_ConfirmationIsGerman checks that the German confirmation
// string is returned when the user's locale is "de".
func TestDisconnect_DE_ConfirmationIsGerman(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVDelete", mock.AnythingOfType("string")).Return(nil)
	api.On("PublishWebSocketEvent",
		"user_connected_state",
		mock.MatchedBy(func(p map[string]any) bool {
			return p["mm_user_id"] == "u2"
		}),
		mock.AnythingOfType("*model.WebsocketBroadcast"),
	).Return()

	h := newHandler(api)
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u2", "/opentalk disconnect"))
	assert.Contains(t, resp.Text, "entfernt")
	api.AssertExpectations(t)
}

// TestDisconnect_BroadcastPayloadHasCorrectUserID confirms that the WebSocket
// payload always carries the requesting user's MM ID, not a hardcoded value.
func TestDisconnect_BroadcastPayloadHasCorrectUserID(t *testing.T) {
	const targetUser = "user-abc-123"
	api := &plugintest.API{}
	api.On("KVDelete", mock.AnythingOfType("string")).Return(nil)
	api.On("PublishWebSocketEvent",
		"user_connected_state",
		mock.MatchedBy(func(p map[string]any) bool {
			return p["mm_user_id"] == targetUser && p["connected"] == false
		}),
		mock.AnythingOfType("*model.WebsocketBroadcast"),
	).Return()

	h := newHandler(api)
	resp, _ := h.Execute(mkArgs(targetUser, "/opentalk disconnect"))
	assert.NotNil(t, resp)
	api.AssertExpectations(t)
}

// TestDisconnect_StoreErrorReturnsEphemeral verifies that when KVDelete fails
// the handler returns a graceful ephemeral message and does NOT call
// PublishWebSocketEvent.
func TestDisconnect_StoreErrorReturnsEphemeral(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVDelete", mock.AnythingOfType("string")).
		Return(&model.AppError{Message: "kv delete failed"})
	// PublishWebSocketEvent must NOT be called on error — no .On() → would panic.

	h := newHandler(api)
	resp, appErr := h.Execute(mkArgs("u1", "/opentalk disconnect"))

	assert.Nil(t, appErr)
	assert.NotNil(t, resp)
	assert.Contains(t, resp.Text, "Failed to remove")
}
