package command

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestBuildHelp_DE_ContainsGermanMarker verifies that the German variant is
// returned for locale "de" and contains at least one German keyword.
func TestBuildHelp_DE_ContainsGermanMarker(t *testing.T) {
	text := buildHelp("de")
	assert.Contains(t, text, "verbinde", "German help should contain 'verbinde'")
}

// TestBuildHelp_EN_ContainsEnglishMarker verifies that the English variant is
// returned for locale "en" and contains an English keyword.
func TestBuildHelp_EN_ContainsEnglishMarker(t *testing.T) {
	text := buildHelp("en")
	assert.Contains(t, text, "link", "English help should contain 'link'")
}

// TestBuildHelp_EmptyLocale_FallsBackToEnglish verifies that an empty locale
// string resolves to English (the i18n package default).
func TestBuildHelp_EmptyLocale_FallsBackToEnglish(t *testing.T) {
	text := buildHelp("")
	assert.Contains(t, text, "link", "empty locale should fall back to English")
	assert.NotContains(t, text, "verbinde", "empty locale should not return German")
}

// TestBuildHelp_DE_Prefix verifies "de-AT" and "de_CH" sub-locales also yield
// German, matching i18n.isGerman's prefix rules.
func TestBuildHelp_DE_SubLocale_IsGerman(t *testing.T) {
	for _, loc := range []string{"de-AT", "de-CH", "de_DE"} {
		text := buildHelp(loc)
		assert.Contains(t, text, "verbinde", "locale %q should return German help", loc)
	}
}

// TestBuildHelp_ContainsAllSubcommands asserts that every subcommand name
// mentioned in the plugin's autocomplete data also appears in the help text
// (for both DE and EN variants). This prevents help from silently drifting out
// of sync with the actual command surface.
func TestBuildHelp_ContainsAllSubcommands(t *testing.T) {
	subcommands := []string{
		"connect",
		"disconnect",
		"info",
		"start",
		"join",
		"end",
		"dial-in",
		"ring",
		"help",
	}

	for _, locale := range []string{"de", "en"} {
		text := buildHelp(locale)
		for _, sub := range subcommands {
			assert.Contains(t, text, sub,
				"help text (locale=%q) should mention subcommand %q", locale, sub)
		}
	}
}

func TestHelp_IncludesMobileSection(t *testing.T) {
	deOut := buildHelp("de")
	assert.Contains(t, deOut, "Mobil")
	assert.Contains(t, deOut, "Browser",
		"German mobile section must mention that the call opens in the browser")

	enOut := buildHelp("en")
	assert.Contains(t, enOut, "Mobile")
	assert.Contains(t, enOut, "browser",
		"English mobile section must mention that the call opens in the browser")
}
