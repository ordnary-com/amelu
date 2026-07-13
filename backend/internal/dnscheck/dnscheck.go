// Package dnscheck performs live DNS lookups to compare a domain's actual
// published records against what Stalwart expects, so customers who manage
// their own DNS (at whatever registrar they already use) can see whether
// they've pasted the records correctly yet.
package dnscheck

import (
	"context"
	"net"
	"strings"
	"time"

	"amelu/backend/internal/stalwart"
)

type Status string

const (
	StatusMatched   Status = "matched"
	StatusMismatch  Status = "mismatch"
	StatusMissing   Status = "missing"
	StatusUnchecked Status = "unchecked" // record type we don't verify live (e.g. CAA, SRV)
)

type RecordCheck struct {
	Type     string   `json:"type"`
	Name     string   `json:"name"`
	Expected string   `json:"expected"`
	Actual   []string `json:"actual,omitempty"`
	Status   Status   `json:"status"`
}

// resolver bypasses the host OS's configured DNS server in favor of a
// public resolver known to handle these lookups reliably — found via the
// domainconnect package's live testing that some ISP resolvers
// intermittently fail lookups that public resolvers (1.1.1.1, 8.8.8.8)
// handle fine. A live "is your DNS correct" check is only trustworthy if
// its own lookups are.
var resolver = &net.Resolver{
	PreferGo: true,
	Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
		d := net.Dialer{Timeout: 5 * time.Second}
		return d.DialContext(ctx, network, "1.1.1.1:53")
	},
}

// Check verifies each expected record from Stalwart's zone file against
// live DNS. Only MX, TXT, and CNAME are actually looked up; other types are
// reported unchecked rather than guessed at.
func Check(ctx context.Context, records []stalwart.ZoneRecord) []RecordCheck {
	out := make([]RecordCheck, 0, len(records))
	for _, rec := range records {
		name := strings.TrimSuffix(rec.Name, ".")

		switch rec.Type {
		case "MX":
			out = append(out, checkMX(ctx, name, rec))
		case "TXT":
			out = append(out, checkTXT(ctx, name, rec))
		case "CNAME":
			out = append(out, checkCNAME(ctx, name, rec))
		default:
			out = append(out, RecordCheck{
				Type: rec.Type, Name: name, Expected: rec.Content, Status: StatusUnchecked,
			})
		}
	}
	return out
}

func checkMX(ctx context.Context, name string, rec stalwart.ZoneRecord) RecordCheck {
	check := RecordCheck{Type: "MX", Name: name, Expected: rec.Content, Status: StatusMissing}

	mxs, err := resolver.LookupMX(ctx, name)
	if err != nil || len(mxs) == 0 {
		return check
	}

	expectedHost := strings.TrimSuffix(rec.Content, ".")
	for _, mx := range mxs {
		actualHost := strings.TrimSuffix(mx.Host, ".")
		check.Actual = append(check.Actual, actualHost)
		if strings.EqualFold(actualHost, expectedHost) {
			check.Status = StatusMatched
		}
	}
	if check.Status != StatusMatched {
		check.Status = StatusMismatch
	}
	return check
}

func checkTXT(ctx context.Context, name string, rec stalwart.ZoneRecord) RecordCheck {
	check := RecordCheck{Type: "TXT", Name: name, Expected: rec.Content, Status: StatusMissing}

	txts, err := resolver.LookupTXT(ctx, name)
	if err != nil || len(txts) == 0 {
		return check
	}

	check.Actual = txts
	for _, txt := range txts {
		if txt == rec.Content {
			check.Status = StatusMatched
			return check
		}
	}
	check.Status = StatusMismatch
	return check
}

func checkCNAME(ctx context.Context, name string, rec stalwart.ZoneRecord) RecordCheck {
	check := RecordCheck{Type: "CNAME", Name: name, Expected: rec.Content, Status: StatusMissing}

	cname, err := resolver.LookupCNAME(ctx, name)
	if err != nil || cname == "" {
		return check
	}

	actual := strings.TrimSuffix(cname, ".")
	expected := strings.TrimSuffix(rec.Content, ".")
	check.Actual = []string{actual}
	if strings.EqualFold(actual, expected) {
		check.Status = StatusMatched
	} else {
		check.Status = StatusMismatch
	}
	return check
}

// AllCheckedMatch reports whether every record that we're able to verify
// live (MX/TXT/CNAME) matches. Unchecked record types don't block this.
func AllCheckedMatch(checks []RecordCheck) bool {
	for _, c := range checks {
		if c.Status == StatusUnchecked {
			continue
		}
		if c.Status != StatusMatched {
			return false
		}
	}
	return true
}
