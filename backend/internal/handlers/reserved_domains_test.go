package handlers

import "testing"

func TestIsReservedDomain(t *testing.T) {
	cases := map[string]bool{
		"ordnary.com":         true,
		"ordnary.com.":        true,
		"mail.ordnary.com":    true,
		"ordnary.cloud":       true,
		"amelu.org":           true,
		"mx.amelu.org":        true,
		"notordnary.com":      false,
		"ordnary.com.evil.io": false,
		"jjawardtravel.com":   false,
	}
	for name, want := range cases {
		if got := isReservedDomain(name); got != want {
			t.Errorf("isReservedDomain(%q) = %v, want %v", name, got, want)
		}
	}
}
