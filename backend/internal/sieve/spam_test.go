package sieve

import "testing"

func TestSenderDenylist(t *testing.T) {
	script, err := GenerateSenderDenylistScript([]string{"spammer@bad.com", "*@bad-domain.ru"})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	blocked, err := Simulate(loaded, "spammer@bad.com", "victim@example.com")
	if err != nil {
		t.Fatalf("simulate blocked: %v", err)
	}
	if blocked.Kept {
		t.Errorf("denylisted sender: expected message to be discarded (Kept=false), got Kept=true")
	}

	blockedWildcard, err := Simulate(loaded, "anything@bad-domain.ru", "victim@example.com")
	if err != nil {
		t.Fatalf("simulate wildcard blocked: %v", err)
	}
	if blockedWildcard.Kept {
		t.Errorf("wildcard denylisted sender: expected discard, got Kept=true")
	}

	clean, err := Simulate(loaded, "friend@good.com", "victim@example.com")
	if err != nil {
		t.Fatalf("simulate clean: %v", err)
	}
	if !clean.Kept {
		t.Errorf("clean sender: expected normal delivery, got Kept=false")
	}
}

func TestSenderDenylistEmpty(t *testing.T) {
	script, err := GenerateSenderDenylistScript(nil)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if script != "" {
		t.Errorf("expected empty script for empty denylist, got %q", script)
	}
}

func TestSenderJunklist(t *testing.T) {
	script, err := GenerateSenderJunklistScript([]string{"promo@marketing.com"})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	result, err := Simulate(loaded, "promo@marketing.com", "victim@example.com")
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}
	if !result.Delivered() {
		t.Errorf("junklisted sender should still be delivered (to Junk), got neither kept nor filed anywhere")
	}
	if len(result.FiledInto) != 1 || result.FiledInto[0] != "Junk Mail" {
		t.Errorf("expected explicit fileinto \"Junk Mail\", got %v", result.FiledInto)
	}
}

func TestSenderJunklistEmpty(t *testing.T) {
	script, err := GenerateSenderJunklistScript([]string{"", ""})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if script != "" {
		t.Errorf("expected empty script when all patterns are blank, got %q", script)
	}
}

func TestRecipientDenylist(t *testing.T) {
	script, err := GenerateRecipientDenylistScript([]string{"deprecated@example.com"})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	blocked, err := Simulate(loaded, "anyone@elsewhere.com", "deprecated@example.com")
	if err != nil {
		t.Fatalf("simulate blocked: %v", err)
	}
	if blocked.Kept {
		t.Errorf("denylisted recipient: expected discard, got Kept=true")
	}

	clean, err := Simulate(loaded, "anyone@elsewhere.com", "active@example.com")
	if err != nil {
		t.Fatalf("simulate clean: %v", err)
	}
	if !clean.Kept {
		t.Errorf("non-denylisted recipient: expected normal delivery, got Kept=false")
	}
}

func TestSubjectHandlingDisabled(t *testing.T) {
	script, err := GenerateSubjectHandlingScript(false, false)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if script != "" {
		t.Errorf("expected empty script when both options disabled, got %q", script)
	}
}

func TestSubjectHandlingJunkIfSpam(t *testing.T) {
	script, err := GenerateSubjectHandlingScript(false, true)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}
	result, err := SimulateMessage(loaded, "anyone@elsewhere.com", "victim@example.com", "Buy cheap SPAM now", nil)
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}
	if !result.Delivered() {
		t.Errorf("expected message with SPAM in subject to still be delivered (to Junk), got neither kept nor filed anywhere")
	}
	if len(result.FiledInto) != 1 || result.FiledInto[0] != "Junk Mail" {
		t.Errorf("expected explicit fileinto \"Junk Mail\", got %v", result.FiledInto)
	}

	clean, err := SimulateMessage(loaded, "anyone@elsewhere.com", "victim@example.com", "Totally normal subject", nil)
	if err != nil {
		t.Fatalf("simulate clean: %v", err)
	}
	if !clean.Kept {
		t.Errorf("expected clean-subject message to be delivered normally, got Kept=false")
	}
}

func TestSubjectHandlingRewrite(t *testing.T) {
	script, err := GenerateSubjectHandlingScript(true, false)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	// Rewrite only fires on mail Stalwart's own classifier already flagged
	// (X-Spam-Status: Yes) - confirmed live this is the header it sets.
	result, err := SimulateMessage(loaded, "anyone@elsewhere.com", "victim@example.com", "Meeting notes",
		map[string]string{"X-Spam-Status": "Yes"})
	if err != nil {
		t.Fatalf("simulate flagged: %v", err)
	}
	if !result.Kept {
		t.Errorf("subject rewrite should not affect delivery, got Kept=false")
	}

	unflagged, err := SimulateMessage(loaded, "anyone@elsewhere.com", "victim@example.com", "Meeting notes", nil)
	if err != nil {
		t.Fatalf("simulate unflagged: %v", err)
	}
	if !unflagged.Kept {
		t.Errorf("unflagged mail should be delivered normally, got Kept=false")
	}
}
