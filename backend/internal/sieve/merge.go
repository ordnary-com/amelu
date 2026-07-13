package sieve

import (
	"sort"
	"strconv"
	"strings"
)

// MergeScripts combines multiple already-valid standalone Sieve scripts
// (each may start with its own "require [...]" line) into a single script
// declaring the union of all required extensions. Necessary because
// Stalwart only allows one active Sieve script per account (confirmed
// live) - a mailbox that's both a domain's Catchall Recipients target and
// covered by a Bcc Capture rule needs both features in the SAME script,
// not two independently activated ones.
func MergeScripts(parts ...string) string {
	extensions := map[string]struct{}{}
	var bodies []string

	for _, part := range parts {
		if strings.TrimSpace(part) == "" {
			continue
		}
		var body []string
		for _, line := range strings.Split(part, "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "require ") {
				for _, name := range extractQuoted(trimmed) {
					extensions[name] = struct{}{}
				}
				continue
			}
			body = append(body, line)
		}
		if bodyText := strings.TrimSpace(strings.Join(body, "\n")); bodyText != "" {
			bodies = append(bodies, bodyText)
		}
	}

	if len(bodies) == 0 {
		return ""
	}

	var script strings.Builder
	if len(extensions) > 0 {
		names := make([]string, 0, len(extensions))
		for name := range extensions {
			names = append(names, name)
		}
		sort.Strings(names)
		quoted := make([]string, len(names))
		for i, n := range names {
			quoted[i] = strconv.Quote(n)
		}
		script.WriteString("require [" + strings.Join(quoted, ", ") + "];\n")
	}
	script.WriteString(strings.Join(bodies, "\n"))
	script.WriteString("\n")
	return script.String()
}

// extractQuoted returns every quoted-string literal on a line, e.g.
// `require ["copy", "variables"];` -> ["copy", "variables"].
func extractQuoted(line string) []string {
	var out []string
	inQuote := false
	var cur strings.Builder
	for _, r := range line {
		if r == '"' {
			if inQuote {
				out = append(out, cur.String())
				cur.Reset()
			}
			inQuote = !inQuote
			continue
		}
		if inQuote {
			cur.WriteRune(r)
		}
	}
	return out
}
