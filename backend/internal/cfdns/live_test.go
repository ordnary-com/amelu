//go:build live

package cfdns

import (
	"context"
	"os"
	"testing"
)

// Run with a real apex domain that isn't on Cloudflare yet:
//
//	AMELU_DNS_TEST_DOMAIN=example.com go test -tags live -run TestLiveZone -v ./internal/cfdns
//
// The zone is deleted again at the end.
func TestLiveZone(t *testing.T) {
	domain := os.Getenv("AMELU_DNS_TEST_DOMAIN")
	if domain == "" {
		t.Skip("set AMELU_DNS_TEST_DOMAIN")
	}
	c := NewClient(os.Getenv("AMELU_DNS_API_TOKEN"), os.Getenv("AMELU_DNS_ACCOUNT_ID"), 0, nil)
	ctx := context.Background()
	z, err := c.CreateZone(ctx, domain)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	defer func() {
		if err := c.DeleteZone(ctx, z.ID); err != nil {
			t.Errorf("delete: %v", err)
		}
	}()
	t.Logf("zone %s status=%s ns=%v", z.ID, z.Status, c.ZoneNameservers(z))
	if err := c.ImportExisting(ctx, z.ID); err != nil {
		t.Logf("scan: %v", err)
	}
	ten := 10
	for _, rec := range []Record{
		{Type: "MX", Name: domain, Content: "marduk.mx.amelu.org", TTL: 3600, Priority: &ten, Comment: "Managed by Amelu for email"},
		{Type: "TXT", Name: domain, Content: "v=spf1 mx -all", TTL: 3600},
		{Type: "SRV", Name: "_autodiscover._tcp." + domain, TTL: 3600, Data: map[string]any{"priority": 0, "weight": 0, "port": 443, "target": "autodiscover.amelu.org"}},
	} {
		if _, err := c.CreateRecord(ctx, z.ID, rec); err != nil {
			t.Fatalf("create %s: %v", rec.Type, err)
		}
	}
	recs, err := c.ListRecords(ctx, z.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, r := range recs {
		t.Logf("%s %s %s comment=%q", r.Type, r.Name, r.Content, r.Comment)
	}
	got, err := c.GetZone(ctx, z.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	t.Logf("get status=%s", got.Status)
}
