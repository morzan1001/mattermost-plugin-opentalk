package command

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestRing_On_BroadcastsEnabledTrue verifies that `/opentalk ring on` calls
// the Broadcaster with event "ring_setting_changed" and enabled:true, and
// returns an ephemeral confirmation in English.
func TestRing_On_BroadcastsEnabledTrue(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)

	var gotEvent string
	var gotPayload map[string]any
	h.Broadcaster = func(event string, payload map[string]any) {
		gotEvent = event
		gotPayload = payload
	}
	h.LocaleOf = func(string) string { return "en" }

	resp, appErr := h.Execute(mkArgs("u1", "/opentalk ring on"))

	require.Nil(t, appErr)
	require.NotNil(t, resp)
	assert.Equal(t, "ring_setting_changed", gotEvent)
	assert.Equal(t, "u1", gotPayload["mm_user_id"])
	assert.Equal(t, true, gotPayload["enabled"])
	assert.Contains(t, resp.Text, "Ringtone enabled")
}

// TestRing_Off_BroadcastsEnabledFalse verifies that `/opentalk ring off` calls
// the Broadcaster with enabled:false and returns English confirmation.
func TestRing_Off_BroadcastsEnabledFalse(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)

	var gotPayload map[string]any
	h.Broadcaster = func(_ string, payload map[string]any) {
		gotPayload = payload
	}
	h.LocaleOf = func(string) string { return "en" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring off"))

	assert.Equal(t, false, gotPayload["enabled"])
	assert.Equal(t, "u1", gotPayload["mm_user_id"])
	assert.Contains(t, resp.Text, "Ringtone disabled")
}

// TestRing_On_DE_BroadcastsAndReturnsGerman verifies the German locale path for
// ring on.
func TestRing_On_DE_BroadcastsAndReturnsGerman(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)

	var gotPayload map[string]any
	h.Broadcaster = func(_ string, payload map[string]any) {
		gotPayload = payload
	}
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u2", "/opentalk ring on"))

	assert.Equal(t, true, gotPayload["enabled"])
	assert.Contains(t, resp.Text, "eingeschaltet")
}

// TestRing_Off_DE_ReturnsGerman verifies the German locale path for ring off.
func TestRing_Off_DE_ReturnsGerman(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)
	h.Broadcaster = func(string, map[string]any) {}
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u2", "/opentalk ring off"))
	assert.Contains(t, resp.Text, "ausgeschaltet")
}

// TestRing_Status_NoBroadcast verifies that `/opentalk ring status` does NOT
// call the Broadcaster and returns a hint about where to find the setting.
func TestRing_Status_NoBroadcast(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)

	broadcasted := false
	h.Broadcaster = func(string, map[string]any) { broadcasted = true }
	h.LocaleOf = func(string) string { return "en" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring status"))

	assert.False(t, broadcasted, "status should not broadcast")
	assert.Contains(t, resp.Text, "Ringtone status")
}

// TestRing_NoSubcommand_NoBroadcast verifies that `/opentalk ring` (no
// argument) returns the status hint without broadcasting.
func TestRing_NoSubcommand_NoBroadcast(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)

	broadcasted := false
	h.Broadcaster = func(string, map[string]any) { broadcasted = true }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring"))

	assert.False(t, broadcasted)
	// Empty sub → "status" branch.
	assert.Contains(t, resp.Text, "ring")
}

// TestRing_UnknownSubcommand_ReturnsUsageLine verifies that an unrecognised
// argument returns the usage-line ephemeral rather than panicking or doing
// nothing.
func TestRing_UnknownSubcommand_ReturnsUsageLine(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)
	h.LocaleOf = func(string) string { return "en" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring wiggle"))

	assert.Contains(t, resp.Text, "ring on|off|status")
}

// TestRing_UnknownSubcommand_DE_ReturnsGermanUsageLine verifies the German
// usage line for unknown subcommands.
func TestRing_UnknownSubcommand_DE_ReturnsGermanUsageLine(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)
	h.LocaleOf = func(string) string { return "de" }

	resp, _ := h.Execute(mkArgs("u1", "/opentalk ring nope"))

	assert.Contains(t, resp.Text, "ring on|off|status")
}

// TestRing_NilBroadcaster_DoesNotPanic ensures that when Broadcaster is nil
// (not wired) the command still returns without panicking.
func TestRing_NilBroadcaster_DoesNotPanic(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)
	// Broadcaster deliberately left nil.

	assert.NotPanics(t, func() {
		resp, _ := h.Execute(mkArgs("u1", "/opentalk ring on"))
		assert.NotNil(t, resp)
	})
}
