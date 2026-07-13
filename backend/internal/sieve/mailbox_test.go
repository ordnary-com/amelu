package sieve

import "testing"

func TestInternalAccess(t *testing.T) {
	script, err := GenerateInternalAccessScript("example.com")
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	external, err := Simulate(loaded, "someone@outside.com", "victim@example.com")
	if err != nil {
		t.Fatalf("simulate external: %v", err)
	}
	if external.Kept {
		t.Errorf("external sender: expected discard, got Kept=true")
	}

	internal, err := Simulate(loaded, "colleague@example.com", "victim@example.com")
	if err != nil {
		t.Fatalf("simulate internal: %v", err)
	}
	if !internal.Kept {
		t.Errorf("internal sender: expected normal delivery, got Kept=false")
	}
}

func TestInternalAccessRequiresDomain(t *testing.T) {
	if _, err := GenerateInternalAccessScript(""); err == nil {
		t.Error("expected error for empty domain")
	}
}

func TestForwarding(t *testing.T) {
	script, err := GenerateForwardingScript([]Forward{{Destination: "archive@elsewhere.com"}})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	clean, err := SimulateMessage(loaded, "sender@elsewhere.com", "victim@example.com", "hello", map[string]string{"X-Spam-Status": "No"})
	if err != nil {
		t.Fatalf("simulate clean: %v", err)
	}
	if !clean.Kept {
		t.Errorf("clean mail: expected original still kept, got Kept=false")
	}
	if len(clean.RedirectAddresses) != 1 || clean.RedirectAddresses[0] != "archive@elsewhere.com" {
		t.Errorf("clean mail: expected forward to archive@elsewhere.com, got %v", clean.RedirectAddresses)
	}

	spam, err := SimulateMessage(loaded, "sender@elsewhere.com", "victim@example.com", "hello", map[string]string{"X-Spam-Status": "Yes"})
	if err != nil {
		t.Fatalf("simulate spam: %v", err)
	}
	if len(spam.RedirectAddresses) != 0 {
		t.Errorf("spam-flagged mail: expected no forward, got %v", spam.RedirectAddresses)
	}
}

func TestForwardingEmpty(t *testing.T) {
	script, err := GenerateForwardingScript(nil)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if script != "" {
		t.Errorf("expected empty script for no forwards, got %q", script)
	}
}

func TestDelegation(t *testing.T) {
	script, err := GenerateDelegationScript([]string{"teammate@example.com"})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	result, err := Simulate(loaded, "sender@elsewhere.com", "victim@example.com")
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}
	if len(result.RedirectAddresses) != 1 || result.RedirectAddresses[0] != "teammate@example.com" {
		t.Errorf("expected redirect to teammate@example.com, got %v", result.RedirectAddresses)
	}
	if result.Kept {
		t.Errorf("delegation is a reassignment, not a copy - expected Kept=false, got true")
	}
}

func TestDelegationEmpty(t *testing.T) {
	script, err := GenerateDelegationScript(nil)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if script != "" {
		t.Errorf("expected empty script for no delegates, got %q", script)
	}
}
