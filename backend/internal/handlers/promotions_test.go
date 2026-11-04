package handlers

import (
	"testing"
	"time"
)

func TestPromotionDue(t *testing.T) {
	now := time.Date(2026, 11, 27, 0, 3, 0, 0, time.FixedZone("CET", 3600))
	expires := time.Date(2026, 11, 28, 0, 0, 0, 0, time.FixedZone("CET", 3600)).Unix()
	cases := []struct {
		name     string
		meta     map[string]string
		expires  int64
		expected bool
	}{
		{"due", map[string]string{"activate_at": "2026-11-27T00:00:00+01:00"}, expires, true},
		{"not yet", map[string]string{"activate_at": "2026-11-28T00:00:00+01:00"}, 0, false},
		{"no schedule", map[string]string{"campaign": "black-friday-2026"}, expires, false},
		{"bad time", map[string]string{"activate_at": "27 November"}, expires, false},
		{"expired", map[string]string{"activate_at": "2026-11-20T00:00:00+01:00"}, now.Unix() - 1, false},
	}
	for _, c := range cases {
		if got := promotionDue(c.meta, c.expires, now); got != c.expected {
			t.Errorf("%s: got %v, want %v", c.name, got, c.expected)
		}
	}
}
