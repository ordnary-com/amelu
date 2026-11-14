package handlers

import (
	"os"
	"slices"
	"strings"
	"testing"

	"amelu/backend/internal/dnscheck"
	"amelu/backend/internal/domainconnect"
	"amelu/backend/internal/stalwart"
)

func TestRecordVarsFromZoneFile(t *testing.T) {
	zone, err := os.ReadFile("../stalwart/testdata/sample_zonefile.txt")
	if err != nil {
		t.Fatal(err)
	}
	const domain = "amelu-test-provisioning-1234.com"
	records := stalwart.ParseZoneFile(stalwart.UseAmeluSPF(stalwart.FilterTLSIncompatibleRecords(string(zone))))

	vars, ok := recordVarsFromZoneFile(records, domain)
	if !ok {
		t.Fatal("sample zone file should match the template")
	}
	if vars.Ed25519Selector != "v1-ed25519-20260711" || vars.RSASelector != "v1-rsa-20260711" {
		t.Errorf("selectors = %q, %q", vars.Ed25519Selector, vars.RSASelector)
	}
	if vars.Ed25519Key != "qC402webF7xeqOjU83ktRQ5hawDPm/K3iWfhQzlMWQg=" {
		t.Errorf("ed25519 key = %q", vars.Ed25519Key)
	}
	if !strings.HasPrefix(vars.RSAKey, "MIIBIjAN") || !strings.HasSuffix(vars.RSAKey, "IDAQAB") || strings.ContainsAny(vars.RSAKey, "\" ") {
		t.Errorf("rsa key = %q", vars.RSAKey)
	}

	changed := stalwart.ParseZoneFile(strings.Replace(string(zone), "p=reject", "p=quarantine", 1))
	if _, ok := recordVarsFromZoneFile(changed, domain); ok {
		t.Error("a DMARC record the template doesn't write must disable the template")
	}
}

func TestGroupsToApply(t *testing.T) {
	const domain = "example.com"
	check := func(typ, name, expected string, status dnscheck.Status) dnscheck.RecordCheck {
		return dnscheck.RecordCheck{Type: typ, Name: name, Expected: expected, Status: status}
	}
	checks := []dnscheck.RecordCheck{
		check("MX", "example.com", "10 marduk.mx.amelu.org.", dnscheck.StatusMismatch),
		check("TXT", "example.com", stalwart.AmeluSPF, dnscheck.StatusMatched),
		check("TXT", "v1-ed25519-20260711._domainkey.example.com", dkimEd25519Prefix+"abc", dnscheck.StatusMissing),
		check("TXT", "v1-rsa-20260711._domainkey.example.com", dkimRSAPrefix+"def", dnscheck.StatusMatched),
		check("TXT", "_dmarc.example.com", "v=DMARC1; p=reject; rua=mailto:postmaster@example.com", dnscheck.StatusMismatch),
		check("TXT", "_smtp._tls.example.com", "v=TLSRPTv1; rua=mailto:postmaster@example.com", dnscheck.StatusMissing),
		check("SRV", "_imaps._tcp.example.com", "0 1 993 marduk.mx.amelu.org.", dnscheck.StatusMatched),
	}

	got := groupsToApply(checks, domain)
	want := []string{domainconnect.GroupMail, domainconnect.GroupDKIMEd25519, domainconnect.GroupTLSRPT}
	if !slices.Equal(got, want) {
		t.Errorf("groups = %v, want %v (an existing DMARC record must keep its group out)", got, want)
	}

	for i := range checks {
		checks[i].Status = dnscheck.StatusMatched
	}
	if got := groupsToApply(checks, domain); len(got) != 0 {
		t.Errorf("all records in place, groups = %v", got)
	}
}
