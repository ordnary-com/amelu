package stalwart

import (
	"regexp"
	"strconv"
	"strings"
)

// ZoneRecord is one DNS record extracted from Stalwart's server-computed
// dnsZoneFile for a domain (MX/SPF/DKIM/DMARC/etc). Stalwart itself decides
// the correct hostnames/keys/policy text; we only reformat its output for
// display/verification rather than constructing record content ourselves.
type ZoneRecord struct {
	Name     string // fully qualified owner name, e.g. "example.com." or "selector1._domainkey.example.com."
	Type     string // MX, TXT, CNAME, A, AAAA, CAA, SRV, ...
	TTL      int
	Priority *int // set for MX and SRV
	Content  string
}

// zoneLineRe matches "<name> [<ttl>] IN <type> <rdata>". Confirmed against a
// live dnsZoneFile: Stalwart omits the TTL field entirely, so it's optional.
var zoneLineRe = regexp.MustCompile(`^(\S+)\s+(?:(\d+)\s+)?IN\s+(\S+)\s+(.*)$`)

// FilterTLSIncompatibleRecords removes customer-domain HTTP discovery
// records until Stalwart can present a certificate for those customer
// hostnames. Pointing them at marduk currently serves marduk's certificate,
// which fails hostname verification. The raw text is filtered instead of
// parsed and rendered again so multi-segment 2048-bit DKIM TXT records stay
// exactly as Stalwart emitted them.
func FilterTLSIncompatibleRecords(zoneFile string) string {
	var out strings.Builder
	skippingContinuation := false

	for _, rawLine := range strings.SplitAfter(zoneFile, "\n") {
		line := strings.TrimSpace(rawLine)
		if skippingContinuation {
			if strings.Contains(line, ")") {
				skippingContinuation = false
			}
			continue
		}

		match := zoneLineRe.FindStringSubmatch(line)
		if match != nil && isTLSIncompatibleRecord(match[1], match[3]) {
			if strings.HasSuffix(line, "(") {
				skippingContinuation = true
			}
			continue
		}
		out.WriteString(rawLine)
	}

	return out.String()
}

func isTLSIncompatibleRecord(name, recordType string) bool {
	label := strings.ToLower(strings.SplitN(strings.TrimSuffix(name, "."), ".", 2)[0])
	switch strings.ToUpper(recordType) {
	case "CNAME":
		return label == "mta-sts" || label == "ua-auto-config" || label == "autoconfig" || label == "autodiscover"
	case "TXT":
		return label == "_mta-sts" || label == "_ua-auto-config"
	default:
		return false
	}
}

// ParseZoneFile parses the BIND-style zone file text returned by Stalwart's
// Domain.dnsZoneFile field.
//
// Confirmed against a live instance: long TXT records (e.g. RSA DKIM keys)
// are split across multiple lines using parenthesized continuation, e.g.:
//
//	name. IN TXT (
//	    "part one"
//	    "part two"
//	)
//
// joinContinuations collapses these into one logical line before the
// per-record regex runs.
func ParseZoneFile(zoneFile string) []ZoneRecord {
	var records []ZoneRecord
	for _, line := range joinContinuations(zoneFile) {
		m := zoneLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		name, ttlStr, rtype, rdata := m[1], m[2], strings.ToUpper(m[3]), strings.TrimSpace(m[4])
		ttl := 3600
		if ttlStr != "" {
			if parsed, err := strconv.Atoi(ttlStr); err == nil {
				ttl = parsed
			}
		}

		rec := ZoneRecord{Name: name, Type: rtype, TTL: ttl}

		switch rtype {
		case "MX":
			parts := strings.SplitN(rdata, " ", 2)
			if len(parts) == 2 {
				if prio, err := strconv.Atoi(parts[0]); err == nil {
					rec.Priority = &prio
					rec.Content = strings.TrimSpace(parts[1])
				} else {
					rec.Content = rdata
				}
			} else {
				rec.Content = rdata
			}
		case "TXT":
			rec.Content = joinQuotedSegments(rdata)
		default:
			rec.Content = rdata
		}

		records = append(records, rec)
	}
	return records
}

// joinContinuations returns one logical line per record, collapsing any
// "( ... )" multi-line continuation into a single line.
func joinContinuations(zoneFile string) []string {
	var out []string
	var buf strings.Builder
	inParens := false

	for _, rawLine := range strings.Split(zoneFile, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, ";") {
			continue
		}

		if inParens {
			buf.WriteString(" ")
			buf.WriteString(strings.TrimSuffix(line, ")"))
			if strings.Contains(line, ")") {
				out = append(out, buf.String())
				buf.Reset()
				inParens = false
			}
			continue
		}

		if strings.HasSuffix(line, "(") {
			buf.WriteString(strings.TrimSuffix(line, "("))
			inParens = true
			continue
		}

		out = append(out, line)
	}
	return out
}

var quotedSegmentRe = regexp.MustCompile(`"([^"]*)"`)

// joinQuotedSegments concatenates one or more quoted strings on a TXT record
// line, since long values (e.g. DKIM keys) are split into multiple
// quoted chunks per RFC 1035.
func joinQuotedSegments(rdata string) string {
	matches := quotedSegmentRe.FindAllStringSubmatch(rdata, -1)
	if len(matches) == 0 {
		return strings.Trim(rdata, `"`)
	}
	var b strings.Builder
	for _, m := range matches {
		b.WriteString(m[1])
	}
	return b.String()
}
