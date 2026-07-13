package sieve

import "testing"

func TestPatternRewrite(t *testing.T) {
	script, err := GeneratePatternRewriteScript([]PatternRewrite{
		{Pattern: "sales-*@example.com", Destination: "sales@example.com"},
	})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	matching, err := Simulate(loaded, "customer@elsewhere.com", "sales-eu@example.com")
	if err != nil {
		t.Fatalf("simulate matching: %v", err)
	}
	if len(matching.RedirectAddresses) != 1 || matching.RedirectAddresses[0] != "sales@example.com" {
		t.Errorf("matching address: got redirects %v, want [sales@example.com]", matching.RedirectAddresses)
	}
	if matching.Kept {
		t.Errorf("matching address: a rewrite should NOT also keep the original, got Kept=true")
	}

	nonMatching, err := Simulate(loaded, "customer@elsewhere.com", "billing@example.com")
	if err != nil {
		t.Fatalf("simulate non-matching: %v", err)
	}
	if len(nonMatching.RedirectAddresses) != 0 {
		t.Errorf("non-matching address: got redirects %v, want none", nonMatching.RedirectAddresses)
	}
	if !nonMatching.Kept {
		t.Errorf("non-matching address: should fall through to normal delivery, got Kept=false")
	}
}

func TestPatternRewriteFirstMatchWins(t *testing.T) {
	script, err := GeneratePatternRewriteScript([]PatternRewrite{
		{Pattern: "sales-*@example.com", Destination: "sales@example.com"},
		{Pattern: "sales-eu@example.com", Destination: "sales-eu-team@example.com"},
	})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	result, err := Simulate(loaded, "customer@elsewhere.com", "sales-eu@example.com")
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}
	if len(result.RedirectAddresses) != 1 || result.RedirectAddresses[0] != "sales@example.com" {
		t.Errorf("got redirects %v, want the first matching rule (sales@example.com) to win", result.RedirectAddresses)
	}
}

func TestBccCapture(t *testing.T) {
	script, err := GenerateBccCaptureScript([]BccCapture{
		{Pattern: "legal-*@example.com", Capture: "compliance-archive@example.com"},
	})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	loaded, err := Validate(script)
	if err != nil {
		t.Fatalf("validate:\n%s\n\nerror: %v", script, err)
	}

	matching, err := Simulate(loaded, "customer@elsewhere.com", "legal-nda@example.com")
	if err != nil {
		t.Fatalf("simulate matching: %v", err)
	}
	if len(matching.RedirectAddresses) != 1 || matching.RedirectAddresses[0] != "compliance-archive@example.com" {
		t.Errorf("matching address: got redirects %v, want [compliance-archive@example.com]", matching.RedirectAddresses)
	}
	if !matching.Kept {
		t.Errorf("matching address: a bcc capture must NOT disturb normal delivery, got Kept=false")
	}

	nonMatching, err := Simulate(loaded, "customer@elsewhere.com", "support@example.com")
	if err != nil {
		t.Fatalf("simulate non-matching: %v", err)
	}
	if len(nonMatching.RedirectAddresses) != 0 {
		t.Errorf("non-matching address: got redirects %v, want none", nonMatching.RedirectAddresses)
	}
	if !nonMatching.Kept {
		t.Errorf("non-matching address: should still be delivered normally, got Kept=false")
	}
}

func TestGenerateRejectsEmptyInput(t *testing.T) {
	if _, err := GeneratePatternRewriteScript(nil); err == nil {
		t.Error("expected error for empty rewrite list")
	}
	if _, err := GenerateBccCaptureScript(nil); err == nil {
		t.Error("expected error for empty capture list")
	}
	if _, err := GeneratePatternRewriteScript([]PatternRewrite{{Pattern: "", Destination: "x@example.com"}}); err == nil {
		t.Error("expected error for empty pattern")
	}
}

// A quoted pattern/destination containing '"' must not break out of the
// Sieve string literal and change what the script does.
func TestGenerateEscapesQuotes(t *testing.T) {
	script, err := GeneratePatternRewriteScript([]PatternRewrite{
		{Pattern: `bad"pattern*@example.com`, Destination: "safe@example.com"},
	})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if _, err := Validate(script); err != nil {
		t.Fatalf("a quote in the pattern should be escaped, not break parsing:\n%s\n\nerror: %v", script, err)
	}
}
