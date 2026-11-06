package handlers

import (
	"os"
	"strings"
	"testing"

	"amelu/backend/internal/stalwart"
)

func TestRecordVarsFromZoneFile(t *testing.T) {
	zone, err := os.ReadFile("../stalwart/testdata/sample_zonefile.txt")
	if err != nil {
		t.Fatal(err)
	}
	const domain = "amelu-test-provisioning-1234.com"
	records := stalwart.ParseZoneFile(stalwart.FilterTLSIncompatibleRecords(string(zone)))

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
