package sieve

import (
	"fmt"
	"strings"
)

// Filter is one dashboard mail filter (see db.MailboxFilter).
type Filter struct {
	Field  string // from, to, subject
	Match  string // contains, is, starts
	Value  string
	Action string // move, forward, read, flag, delete
	Target string // folder for move, address for forward
	Stop   bool
}

// GenerateFilterScript turns the mailbox's filters into Sieve, one if-block
// each, in order. Tests are case-insensitive (i;ascii-casemap is Sieve's
// default comparator). Move uses fileinto :create, so a folder that doesn't
// exist yet is made instead of the mail falling back to the inbox.
func GenerateFilterScript(filters []Filter) (string, error) {
	if len(filters) == 0 {
		return "", nil
	}
	var body strings.Builder
	need := map[string]bool{}
	for i, f := range filters {
		if strings.TrimSpace(f.Value) == "" {
			return "", fmt.Errorf("filter %d: a value to match is required", i+1)
		}
		test, err := filterTest(f)
		if err != nil {
			return "", fmt.Errorf("filter %d: %w", i+1, err)
		}
		var action string
		switch f.Action {
		case "move":
			if strings.TrimSpace(f.Target) == "" {
				return "", fmt.Errorf("filter %d: a folder is required", i+1)
			}
			need["fileinto"], need["mailbox"] = true, true
			action = "fileinto :create " + quoteSieveString(strings.TrimSpace(f.Target)) + ";"
		case "forward":
			if !strings.Contains(f.Target, "@") {
				return "", fmt.Errorf("filter %d: a valid forwarding address is required", i+1)
			}
			need["copy"] = true
			action = "redirect :copy " + quoteSieveString(strings.TrimSpace(f.Target)) + ";"
		case "read":
			need["imap4flags"] = true
			action = `addflag "\\Seen";`
		case "flag":
			need["imap4flags"] = true
			action = `addflag "\\Flagged";`
		case "delete":
			action = "discard;"
		default:
			return "", fmt.Errorf("filter %d: unknown action %q", i+1, f.Action)
		}
		fmt.Fprintf(&body, "if %s {\n\t%s\n", test, action)
		// Deleting ends processing anyway; for the rest it's the filter's choice.
		if f.Stop || f.Action == "delete" {
			body.WriteString("\tstop;\n")
		}
		body.WriteString("}\n")
	}
	var exts []string
	for _, name := range []string{"copy", "fileinto", "imap4flags", "mailbox"} {
		if need[name] {
			exts = append(exts, `"`+name+`"`)
		}
	}
	script := body.String()
	if len(exts) > 0 {
		script = "require [" + strings.Join(exts, ", ") + "];\n" + script
	}
	return script, nil
}

func filterTest(f Filter) (string, error) {
	var match string
	value := strings.TrimSpace(f.Value)
	switch f.Match {
	case "contains":
		match = ":contains"
	case "is":
		match = ":is"
	case "starts":
		match = ":matches"
		value = escapeWildcards(value) + "*"
	default:
		return "", fmt.Errorf("unknown match %q", f.Match)
	}
	quoted := quoteSieveString(value)
	switch f.Field {
	case "from":
		return fmt.Sprintf(`address %s "from" %s`, match, quoted), nil
	case "to":
		return fmt.Sprintf(`address %s ["to", "cc"] %s`, match, quoted), nil
	case "subject":
		return fmt.Sprintf(`header %s "subject" %s`, match, quoted), nil
	default:
		return "", fmt.Errorf("unknown field %q", f.Field)
	}
}

// escapeWildcards keeps a typed * or ? literal in a :matches test.
func escapeWildcards(s string) string {
	return strings.NewReplacer(`\`, `\\`, `*`, `\*`, `?`, `\?`).Replace(s)
}
