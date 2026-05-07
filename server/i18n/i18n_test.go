package i18n

import "testing"

func TestT(t *testing.T) {
	m := Translatable{DE: "Deutsch", EN: "English"}

	cases := []struct {
		locale string
		want   string
	}{
		// Empty → English
		{"", "English"},

		// Canonical German
		{"de", "Deutsch"},
		{"DE", "Deutsch"},

		// BCP-47 hyphen variants
		{"de-DE", "Deutsch"},
		{"de-AT", "Deutsch"},
		{"de-CH", "Deutsch"},

		// Underscore variants (some MM configs)
		{"de_CH", "Deutsch"},
		{"de_DE", "Deutsch"},

		// Non-German → English
		{"en", "English"},
		{"en-US", "English"},
		{"fr", "English"},
		{"fr-FR", "English"},
		{"pt-BR", "English"},
	}

	for _, tc := range cases {
		got := T(tc.locale, m)
		if got != tc.want {
			t.Errorf("T(%q) = %q; want %q", tc.locale, got, tc.want)
		}
	}
}
