package handlers

import "testing"

func TestOnboardingPickKeepsKnownChoices(t *testing.T) {
	if got := pick("search", onboardingSources); got != "search" {
		t.Errorf("pick(search) = %q", got)
	}
	if got := pick("<script>", onboardingSources); got != "" {
		t.Errorf("pick(unknown) = %q, want empty", got)
	}
}
