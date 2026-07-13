// Package sieve generates and validates Sieve scripts (RFC 5228) for the two
// Amelu features Stalwart has no structured object for: Pattern Rewrites
// (wildcard address redirects) and Bcc Captures (silent copies that don't
// disturb normal delivery). It uses github.com/migadu/go-sieve both to parse
// the generated text (catching a malformed template before it ever reaches
// the mail cluster) and to run it against a synthetic message, so a rewrite
// or capture rule can be proven correct before being installed anywhere.
package sieve

import (
	"fmt"
	"strconv"
)

// PatternRewrite redirects any mail whose recipient matches Pattern (a
// Sieve/glob-style pattern - "*" and "?" wildcards, matched against the
// full address) to Destination instead. Matching mail is NOT also kept at
// the original address - this is a rewrite, not a copy.
type PatternRewrite struct {
	Pattern     string
	Destination string
}

// BccCapture silently redirects a copy of any mail whose recipient matches
// Pattern to Capture, using Sieve's :copy modifier (RFC 3894) so the
// original delivery is completely unaffected - the defining trait of a
// "Bcc" as opposed to a rewrite.
type BccCapture struct {
	Pattern string
	Capture string
}

// quoteSieveString escapes a string for use as a Sieve quoted-string
// literal. Sieve quoted strings only need '"' and '\' escaped (RFC 5228
// section 2.4.2) - there's no other metacharacter to worry about.
func quoteSieveString(s string) string {
	return strconv.Quote(s)
}

// GeneratePatternRewriteScript produces a complete Sieve script that
// redirects mail matching any of the given rewrites, evaluated in order,
// first match wins. An address matching none of them falls through to
// Sieve's implicit keep (normal delivery, unaffected).
func GeneratePatternRewriteScript(rewrites []PatternRewrite) (string, error) {
	if len(rewrites) == 0 {
		return "", fmt.Errorf("at least one pattern rewrite is required")
	}

	script := ""
	for _, rw := range rewrites {
		if rw.Pattern == "" || rw.Destination == "" {
			return "", fmt.Errorf("pattern and destination are both required")
		}
		script += fmt.Sprintf(
			"if address :matches \"to\" %s {\n\tredirect %s;\n\tstop;\n}\n",
			quoteSieveString(rw.Pattern), quoteSieveString(rw.Destination),
		)
	}
	return script, nil
}

// GenerateBccCaptureScript produces a complete Sieve script that sends a
// copy of mail matching any of the given captures to their capture
// address, leaving normal delivery of the original completely intact.
func GenerateBccCaptureScript(captures []BccCapture) (string, error) {
	if len(captures) == 0 {
		return "", fmt.Errorf("at least one bcc capture is required")
	}

	script := `require ["copy"];` + "\n"
	for _, c := range captures {
		if c.Pattern == "" || c.Capture == "" {
			return "", fmt.Errorf("pattern and capture address are both required")
		}
		script += fmt.Sprintf(
			"if address :matches \"to\" %s {\n\tredirect :copy %s;\n}\n",
			quoteSieveString(c.Pattern), quoteSieveString(c.Capture),
		)
	}
	return script, nil
}

// GenerateSenderDenylistScript produces a Sieve script that silently drops
// mail from any of the given sender patterns. Uses "discard" rather than
// Sieve's "reject" action for two reasons: go-sieve (our own validator)
// doesn't implement the reject extension at all, and discarding avoids the
// backscatter problem of bouncing to a sender address spammers routinely
// forge - discard is the safer default regardless. An empty list is valid
// (nothing to discard), not an error.
func GenerateSenderDenylistScript(patterns []string) (string, error) {
	script := ""
	for _, p := range patterns {
		if p == "" {
			continue
		}
		script += fmt.Sprintf("if address :matches \"from\" %s {\n\tdiscard;\n\tstop;\n}\n", quoteSieveString(p))
	}
	return script, nil
}

// GenerateSenderJunklistScript produces a Sieve script that force-files
// mail from any of the given sender patterns into Junk Mail, even when
// Stalwart's own classifier would otherwise have delivered it as ham -
// confirmed live this works (unlike trying to rescue a message already
// classified as spam, which Stalwart's classifier silently overrides).
func GenerateSenderJunklistScript(patterns []string) (string, error) {
	if allEmpty(patterns) {
		return "", nil
	}
	script := `require ["imap4flags", "fileinto"];` + "\n"
	for _, p := range patterns {
		if p == "" {
			continue
		}
		script += fmt.Sprintf(
			"if address :matches \"from\" %s {\n\tsetflag \"$junk\";\n\tfileinto \"Junk Mail\";\n\tstop;\n}\n",
			quoteSieveString(p),
		)
	}
	return script, nil
}

// GenerateRecipientDenylistScript produces a Sieve script that silently
// drops mail addressed to any of the given exact recipient addresses (no
// wildcards - matches Migadu's own "complete addresses only" rule for this
// list).
func GenerateRecipientDenylistScript(addresses []string) (string, error) {
	script := ""
	for _, a := range addresses {
		if a == "" {
			continue
		}
		script += fmt.Sprintf("if address :is \"to\" %s {\n\tdiscard;\n\tstop;\n}\n", quoteSieveString(a))
	}
	return script, nil
}

// GenerateSubjectHandlingScript produces the two independent Aggressiveness
// checkboxes: junkIfSubjectSpam force-files any mail whose subject contains
// "spam" (case-insensitive) into Junk Mail even if otherwise classified as
// ham; rewrite prefixes "[SPAM] " onto the subject of mail Stalwart's own
// classifier already flagged (X-Spam-Status: Yes) - confirmed live that
// header edits like this persist even on classifier-flagged mail, unlike
// mailbox/flag placement changes.
func GenerateSubjectHandlingScript(rewrite, junkIfSubjectSpam bool) (string, error) {
	if !rewrite && !junkIfSubjectSpam {
		return "", nil
	}
	script := ""
	if junkIfSubjectSpam {
		script += `require ["imap4flags", "fileinto"];` + "\n"
		script += "if header :contains \"subject\" \"spam\" {\n\tsetflag \"$junk\";\n\tfileinto \"Junk Mail\";\n}\n"
	}
	if rewrite {
		script += `require ["editheader", "variables"];` + "\n"
		script += "if header :contains \"X-Spam-Status\" \"Yes\" {\n" +
			"\tif header :matches \"subject\" \"*\" {\n" +
			"\t\tset \"s\" \"${1}\";\n" +
			"\t\tdeleteheader \"subject\";\n" +
			"\t\taddheader \"subject\" \"[SPAM] ${s}\";\n" +
			"\t}\n}\n"
	}
	return script, nil
}

func allEmpty(items []string) bool {
	for _, i := range items {
		if i != "" {
			return false
		}
	}
	return true
}
