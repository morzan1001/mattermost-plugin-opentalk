// Package i18n provides a tiny lookup helper for the plugin's two
// supported languages: German for MM-user locales 'de' / 'de-*', English
// otherwise. Each string-site declares both translations inline as a
// Translatable; T(locale, ...) returns the matching variant.
package i18n

import "strings"

// Translatable holds the German and English variants of a single user-facing
// string. The zero value yields empty strings for both languages.
type Translatable struct {
	DE string
	EN string
}

// T resolves a Translatable for the given locale. Empty / non-German
// locale yields the EN variant.
func T(locale string, m Translatable) string {
	if isGerman(locale) {
		return m.DE
	}
	return m.EN
}

func isGerman(locale string) bool {
	if locale == "" {
		return false
	}
	l := strings.ToLower(locale)
	return l == "de" || strings.HasPrefix(l, "de-") || strings.HasPrefix(l, "de_")
}
