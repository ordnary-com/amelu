package stalwart

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// backupMXHost is one of the other nodes in this Stalwart cluster, added
// as DNS-level MX failover on top of Stalwart's own auto-generated zone
// file - which only ever includes a single MX record for marduk, the node
// the admin API talks to. Confirmed live: since all three nodes share
// cluster storage, mail sent directly to either of these independently
// delivers correctly for any domain in the cluster, not just marduk's -
// so without these, marduk being unreachable would break inbound mail for
// every domain even though the other two nodes could easily have handled
// it.
type backupMXHost struct {
	Host     string
	Priority int
}

var backupMXHosts = []backupMXHost{
	{Host: "nabu.mx.amelu.org.", Priority: 20},
	{Host: "ishtar.mx.amelu.org.", Priority: 30},
}

// AppendBackupMXRecords adds ZoneRecord entries for the cluster's other
// nodes after whatever MX record(s) Stalwart's own zone file already
// contains for domainName - for the parsed-record consumer (DNS
// Configuration's live-verified table).
func AppendBackupMXRecords(records []ZoneRecord, domainName string) []ZoneRecord {
	name := domainName + "."
	for _, host := range backupMXHosts {
		priority := host.Priority
		records = append(records, ZoneRecord{
			Name:     name,
			Type:     "MX",
			TTL:      3600,
			Priority: &priority,
			Content:  host.Host,
		})
	}
	return records
}

// AppendBackupMXZoneFileLines returns BIND-format zone file text for the
// cluster's other nodes, meant to be appended after Stalwart's own raw
// zone file text - for the verbatim BIND-file-download consumer.
func AppendBackupMXZoneFileLines(domainName string) string {
	name := domainName + "."
	var b strings.Builder
	b.WriteString("\n; Backup MX records - other nodes in the same Amelu mail cluster,\n; for failover if the primary node above is unreachable.\n")
	for _, host := range backupMXHosts {
		fmt.Fprintf(&b, "%s\t3600\tIN\tMX\t%d %s\n", name, host.Priority, host.Host)
	}
	return b.String()
}

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
