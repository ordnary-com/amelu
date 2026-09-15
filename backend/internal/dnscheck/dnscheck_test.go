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
