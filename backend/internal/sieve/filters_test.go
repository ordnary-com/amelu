package sieve

import (
	"strings"
	"testing"
)

func TestGenerateFilterScriptValidates(t *testing.T) {
	script, err := GenerateFilterScript([]Filter{
		{Field: "from", Match: "contains", Value: "newsletter@", Action: "move", Target: "Newsletters", Stop: true},
		{Field: "subject", Match: "starts", Value: "[Invoice*", Action: "forward", Target: "books@example.com"},
		{Field: "to", Match: "is", Value: "sales@example.com", Action: "flag"},
		{Field: "from", Match: "is", Value: "spam@example.net", Action: "delete"},
		{Field: "subject", Match: "contains", Value: `say "hi"`, Action: "read"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Validate(script); err != nil {
		t.Fatalf("invalid sieve: %v\n%s", err, script)
	}
	for _, want := range []string{`fileinto :create "Newsletters"`, `"[Invoice\\**"`, `redirect :copy "books@example.com"`, `addflag "\\Flagged"`, "discard;"} {
		if !strings.Contains(script, want) {
			t.Errorf("script lacks %s:\n%s", want, script)
		}
	}
	if !strings.HasPrefix(script, `require ["copy", "fileinto", "imap4flags", "mailbox"];`) {
		t.Errorf("require line: %s", strings.SplitN(script, "\n", 2)[0])
	}
}

func TestGenerateFilterScriptRejects(t *testing.T) {
	for _, f := range []Filter{
		{Field: "from", Match: "contains", Value: "", Action: "delete"},
		{Field: "from", Match: "contains", Value: "x", Action: "move"},
		{Field: "from", Match: "contains", Value: "x", Action: "forward", Target: "nope"},
		{Field: "body", Match: "contains", Value: "x", Action: "delete"},
		{Field: "from", Match: "regex", Value: "x", Action: "delete"},
	} {
		if _, err := GenerateFilterScript([]Filter{f}); err == nil {
			t.Errorf("expected an error for %+v", f)
		}
	}
}

func TestMergedFilterScriptValidates(t *testing.T) {
	filters, _ := GenerateFilterScript([]Filter{{Field: "from", Match: "contains", Value: "a", Action: "move", Target: "A"}})
	forwards, _ := GenerateForwardingScript([]Forward{{Destination: "x@example.com"}})
	if _, err := Validate(MergeScripts(filters, forwards)); err != nil {
		t.Fatal(err)
	}
}
