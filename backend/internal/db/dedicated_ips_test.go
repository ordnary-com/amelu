package db

import (
	"context"
	"errors"
	"testing"
)

func TestDedicatedIPs(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	ip, host := "89.106.70.63", "out-63.mta0.amelu.org"
	_, _ = s.conn.ExecContext(ctx, `DELETE FROM dedicated_ips WHERE ip = $1`, ip)
	t.Cleanup(func() { _, _ = s.conn.ExecContext(ctx, `DELETE FROM dedicated_ips WHERE ip = $1`, ip) })

	if err := s.AddDedicatedIP(ctx, ip, host, "test"); err != nil {
		t.Fatalf("add: %v", err)
	}
	if err := s.AddDedicatedIP(ctx, ip, host, ""); !errors.Is(err, ErrDedicatedIPExists) {
		t.Fatalf("adding it twice should fail with ErrDedicatedIPExists, got %v", err)
	}
	dom, err := s.CreateDomain(ctx, ownerID, "dedicated-"+randomSuffix(t)+".example", false)
	if err != nil {
		t.Fatalf("domain: %v", err)
	}
	if err := s.AssignDedicatedIP(ctx, ip, &orgID); err != nil {
		t.Fatalf("assign: %v", err)
	}
	if err := s.DeleteDedicatedIP(ctx, ip); !errors.Is(err, ErrDedicatedIPInUse) {
		t.Fatalf("deleting an assigned IP should fail, got %v", err)
	}
	mine, err := s.ListDedicatedIPsForOrganization(ctx, orgID)
	if err != nil || len(mine) != 1 || mine[0].IP != ip || !mine[0].AssignedAt.Valid {
		t.Fatalf("organization's IPs: %+v %v", mine, err)
	}
	routes, err := s.DedicatedIPRoutes(ctx)
	if err != nil {
		t.Fatalf("routes: %v", err)
	}
	var found *DedicatedIPRoute
	for i := range routes {
		if routes[i].IP == ip {
			found = &routes[i]
		}
	}
	if found == nil || found.Hostname != host || len(found.Domains) != 1 || found.Domains[0] != dom.Name {
		t.Fatalf("route for %s: %+v", ip, found)
	}
	if err := s.AssignDedicatedIP(ctx, ip, nil); err != nil {
		t.Fatalf("release: %v", err)
	}
	if d, _ := s.GetDedicatedIP(ctx, ip); d.OrganizationID.Valid || d.AssignedAt.Valid {
		t.Fatalf("released IP still assigned: %+v", d)
	}
	if err := s.DeleteDedicatedIP(ctx, ip); err != nil {
		t.Fatalf("delete: %v", err)
	}
}
