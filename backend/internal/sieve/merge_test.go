package sieve

import "testing"

func TestMergeScriptsCombinesRequireLines(t *testing.T) {
	rewriteScript, err := GeneratePatternRewriteScript([]PatternRewrite{
		{Pattern: "sales-*@example.com", Destination: "sales@example.com"},
	})
	if err != nil {
		t.Fatalf("generate rewrite: %v", err)
	}
	bccScript, err := GenerateBccCaptureScript([]BccCapture{
		{Pattern: "*@example.com", Capture: "archive@example.org"},
	})
	if err != nil {
		t.Fatalf("generate bcc: %v", err)
	}

	merged := MergeScripts(bccScript, rewriteScript)
	loaded, err := Validate(merged)
	if err != nil {
		t.Fatalf("validate merged:\n%s\n\nerror: %v", merged, err)
	}

	// A message to sales-eu@ should hit the rewrite AND still get bcc'd,
	// since Sieve evaluates every "if" block in the script in sequence -
	// the merge must preserve both behaviors, not just make them coexist
	// without erroring.
	result, err := Simulate(loaded, "customer@elsewhere.com", "sales-eu@example.com")
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}
	if len(result.RedirectAddresses) != 2 {
		t.Fatalf("got redirects %v, want both the rewrite destination and the bcc capture", result.RedirectAddresses)
	}
	hasRewrite, hasCapture := false, false
	for _, addr := range result.RedirectAddresses {
		if addr == "sales@example.com" {
			hasRewrite = true
		}
		if addr == "archive@example.org" {
			hasCapture = true
		}
	}
	if !hasRewrite || !hasCapture {
		t.Errorf("got redirects %v, want [sales@example.com archive@example.org] (order-independent)", result.RedirectAddresses)
	}
}

func TestMergeScriptsSkipsEmptyParts(t *testing.T) {
	bccScript, err := GenerateBccCaptureScript([]BccCapture{
		{Pattern: "*@example.com", Capture: "archive@example.org"},
	})
	if err != nil {
		t.Fatalf("generate bcc: %v", err)
	}

	merged := MergeScripts("", bccScript)
	if _, err := Validate(merged); err != nil {
		t.Fatalf("validate merged with an empty part:\n%s\n\nerror: %v", merged, err)
	}
}

func TestMergeScriptsAllEmpty(t *testing.T) {
	if merged := MergeScripts("", "   \n"); merged != "" {
		t.Errorf("expected empty result when all parts are empty, got %q", merged)
	}
}
