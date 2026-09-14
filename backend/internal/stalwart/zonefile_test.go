package stalwart

import (
	"os"
	"strings"
	"testing"
)

// testdata/sample_zonefile.txt is a real dnsZoneFile captured from a live
// Stalwart instance (marduk.mx.amelu.org) for a freshly created domain, kept
// as a regression fixture: this exact text is what exposed two parser bugs
// during manual verification — Stalwart omits the TTL field, and long TXT
// records (RSA DKIM keys) use parenthesized multi-line continuation.
func TestParseZoneFile_LiveFixture(t *testing.T) {
	data, err := os.ReadFile("testdata/sample_zonefile.txt")
	if err != nil {
		t.Fatal(err)
	}

	records := ParseZoneFile(string(data))

	byType := map[string]int{}
	for _, r := range records {
		byType[r.Type]++
	}

	want := map[string]int{
		"TXT":   7,
		"MX":    1,
		"SRV":   6,
		"CNAME": 4,
	}
	for rtype, count := range want {
		if byType[rtype] != count {
			t.Errorf("type %s: got %d records, want %d", rtype, byType[rtype], count)
		}
	}
	if total := len(records); total != 18 {
		t.Errorf("got %d total records, want 18", total)
	}

	var mx *ZoneRecord
	var rsaDKIM *ZoneRecord
	for i := range records {
		switch {
		case records[i].Type == "MX":
			mx = &records[i]
		case records[i].Type == "TXT" && records[i].Name == "v1-rsa-20260711._domainkey.amelu-test-provisioning-1234.com.":
			rsaDKIM = &records[i]
		}
	}

	if mx == nil {
		t.Fatal("MX record not found")
	}
	if mx.Priority == nil || *mx.Priority != 10 {
		t.Errorf("MX priority = %v, want 10", mx.Priority)
	}
	if mx.Content != "marduk.mx.amelu.org." {
		t.Errorf("MX content = %q, want marduk.mx.amelu.org.", mx.Content)
	}

	if rsaDKIM == nil {
		t.Fatal("multi-line RSA DKIM TXT record not found or not joined correctly")
	}
	if !strings.Contains(rsaDKIM.Content, "v=DKIM1; k=rsa") || !strings.Contains(rsaDKIM.Content, "AQAB") {
		t.Errorf("RSA DKIM TXT content not fully joined: %q", rsaDKIM.Content)
	}
}

func TestFilterTLSIncompatibleRecords(t *testing.T) {
	data, err := os.ReadFile("testdata/sample_zonefile.txt")
	if err != nil {
		t.Fatal(err)
	}

	filtered := FilterTLSIncompatibleRecords(string(data))
	records := ParseZoneFile(filtered)

	for _, record := range records {
		if isTLSIncompatibleRecord(record.Name, record.Type) {
			t.Errorf("TLS-incompatible record was not filtered: %s %s", record.Type, record.Name)
		}
	}
	if strings.Contains(filtered, "mta-sts.amelu-test-provisioning-1234.com") ||
		strings.Contains(filtered, "autoconfig.amelu-test-provisioning-1234.com") ||
		strings.Contains(filtered, "autodiscover.amelu-test-provisioning-1234.com") ||
		strings.Contains(filtered, "ua-auto-config.amelu-test-provisioning-1234.com") {
		t.Error("filtered zone file still contains a customer-domain HTTP discovery hostname")
	}
	if !strings.Contains(filtered, "v1-rsa-20260711._domainkey") || !strings.Contains(filtered, "AQAB") {
		t.Error("multi-line RSA DKIM record was changed or removed")
	}
	if len(records) != 12 {
		t.Errorf("got %d records after filtering, want 12", len(records))
	}
}
