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

func TestAppendBackupMXRecords(t *testing.T) {
	base := []ZoneRecord{{Name: "example.com.", Type: "MX", TTL: 3600, Priority: intPtr(10), Content: "marduk.mx.amelu.org."}}
	records := AppendBackupMXRecords(base, "example.com")

	if len(records) != 3 {
		t.Fatalf("got %d records, want 3 (1 original + 2 backup)", len(records))
	}

	var mxHosts []string
	var priorities []int
	for _, r := range records {
		if r.Type != "MX" {
			t.Errorf("unexpected non-MX record: %+v", r)
			continue
		}
		if r.Name != "example.com." {
			t.Errorf("record name = %q, want %q", r.Name, "example.com.")
		}
		if r.Priority == nil {
			t.Fatalf("record %+v has nil priority", r)
		}
		mxHosts = append(mxHosts, r.Content)
		priorities = append(priorities, *r.Priority)
	}

	wantHosts := []string{"marduk.mx.amelu.org.", "nabu.mx.amelu.org.", "ishtar.mx.amelu.org."}
	for i, want := range wantHosts {
		if mxHosts[i] != want {
			t.Errorf("mxHosts[%d] = %q, want %q", i, mxHosts[i], want)
		}
	}
	wantPriorities := []int{10, 20, 30}
	for i, want := range wantPriorities {
		if priorities[i] != want {
			t.Errorf("priorities[%d] = %d, want %d", i, priorities[i], want)
		}
	}
}

func TestAppendBackupMXZoneFileLines(t *testing.T) {
	lines := AppendBackupMXZoneFileLines("example.com")
	if !strings.Contains(lines, "example.com.\t3600\tIN\tMX\t20 nabu.mx.amelu.org.") {
		t.Errorf("missing nabu MX line, got:\n%s", lines)
	}
	if !strings.Contains(lines, "example.com.\t3600\tIN\tMX\t30 ishtar.mx.amelu.org.") {
		t.Errorf("missing ishtar MX line, got:\n%s", lines)
	}
}

func intPtr(i int) *int { return &i }
