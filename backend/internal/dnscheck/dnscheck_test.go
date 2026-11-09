package dnscheck

import (
	"context"
	"net"
	"testing"

	"amelu/backend/internal/stalwart"
)

type fakeResolver struct {
	srvs []*net.SRV
}

func (f fakeResolver) LookupMX(context.Context, string) ([]*net.MX, error) { return nil, nil }
func (f fakeResolver) LookupTXT(context.Context, string) ([]string, error) { return nil, nil }
func (f fakeResolver) LookupCNAME(context.Context, string) (string, error) { return "", nil }
func (f fakeResolver) LookupSRV(context.Context, string, string, string) (string, []*net.SRV, error) {
	return "", f.srvs, nil
}

func useResolver(t *testing.T, replacement dnsResolver) {
	t.Helper()
	previous := resolver
	resolver = replacement
	t.Cleanup(func() { resolver = previous })
}

func TestCheckSRVMatchesExpectedRecord(t *testing.T) {
	useResolver(t, fakeResolver{srvs: []*net.SRV{{Target: "MARDUK.mx.amelu.org.", Port: 993, Priority: 0, Weight: 1}}})
	checks := Check(context.Background(), []stalwart.ZoneRecord{{
		Type: "SRV", Name: "_imaps._tcp.amelu.org.", Content: "0 1 993 marduk.mx.amelu.org.",
	}})

	if len(checks) != 1 {
		t.Fatalf("expected one check, got %d", len(checks))
	}
	if checks[0].Status != StatusMatched {
		t.Fatalf("expected SRV record to match, got %s (actual: %v)", checks[0].Status, checks[0].Actual)
	}
}

func TestCheckSRVDetectsMismatch(t *testing.T) {
	useResolver(t, fakeResolver{srvs: []*net.SRV{{Target: "marduk.mx.amelu.org.", Port: 993, Priority: 0, Weight: 1}}})
	checks := Check(context.Background(), []stalwart.ZoneRecord{{
		Type: "SRV", Name: "_imaps._tcp.amelu.org.", Content: "0 1 994 marduk.mx.amelu.org.",
	}})

	if len(checks) != 1 {
		t.Fatalf("expected one check, got %d", len(checks))
	}
	if checks[0].Status != StatusMismatch {
		t.Fatalf("expected SRV record to mismatch, got %s (actual: %v)", checks[0].Status, checks[0].Actual)
	}
}

func TestSPFCovers(t *testing.T) {
	cases := []struct {
		actual string
		want   bool
	}{
		{"v=spf1 mx -all", true},
		{"v=spf1 mx ~all", true},
		{"v=spf1 include:_spf.google.com mx ~all", true},
		{"v=spf1 include:_spf.google.com ~all", false},
		{"google-site-verification=abc", false},
	}
	for _, c := range cases {
		if got := spfCovers(c.actual, "v=spf1 mx -all"); got != c.want {
			t.Errorf("spfCovers(%q) = %v, want %v", c.actual, got, c.want)
		}
	}
}

func TestSPFCoversAmeluInclude(t *testing.T) {
	cases := []struct {
		actual string
		want   bool
	}{
		{"v=spf1 include:_spf.amelu.org -all", true},
		{"v=spf1 include:_spf.google.com include:_spf.amelu.org ~all", true},
		// Set up before _spf.amelu.org existed.
		{"v=spf1 mx -all", true},
		{"v=spf1 include:_spf.google.com ~all", false},
	}
	for _, c := range cases {
		if got := spfCovers(c.actual, "v=spf1 include:_spf.amelu.org -all"); got != c.want {
			t.Errorf("spfCovers(%q) = %v, want %v", c.actual, got, c.want)
		}
	}
}

// txtResolver answers TXT lookups for one name only.
type txtResolver struct {
	fakeResolver
	name string
	txts []string
}

func (f txtResolver) LookupTXT(_ context.Context, name string) ([]string, error) {
	if name != f.name {
		return nil, &net.DNSError{Err: "no such host", Name: name, IsNotFound: true}
	}
	return f.txts, nil
}

func TestHasOwnershipRecord(t *testing.T) {
	useResolver(t, txtResolver{name: "_amelu.example.com", txts: []string{"v=spf1 -all", "amelu-verify=abc123"}})
	if !HasOwnershipRecord(context.Background(), "example.com", "abc123") {
		t.Error("record with the right token should count")
	}
	if HasOwnershipRecord(context.Background(), "example.com", "other") {
		t.Error("a different token must not count")
	}
	if HasOwnershipRecord(context.Background(), "hotmail.com", "abc123") {
		t.Error("a domain without the record must not count")
	}
}
