package db

import (
	"context"
	"testing"
	"time"
)

func TestLogAndListOrganizationAudit(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)

	if err := s.LogOrganizationAudit(ctx, orgID, &ownerID, "owner@example.com", "domain.created", "domain", "d1", "example.com", map[string]any{"foo": "bar"}, "127.0.0.1"); err != nil {
		t.Fatalf("log domain audit: %v", err)
	}
	if err := s.LogOrganizationAudit(ctx, orgID, &ownerID, "owner@example.com", "billing.subscription_started", "billing", "", "", nil, ""); err != nil {
		t.Fatalf("log billing audit: %v", err)
	}

	all, err := s.ListOrganizationAudit(ctx, orgID, nil, time.Time{}, 10)
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 entries with no object type filter, got %d", len(all))
	}

	billingOnly, err := s.ListOrganizationAudit(ctx, orgID, []string{"billing"}, time.Time{}, 10)
	if err != nil {
		t.Fatalf("list billing-only: %v", err)
	}
	if len(billingOnly) != 1 || billingOnly[0].ObjectType != "billing" {
		t.Fatalf("expected exactly 1 billing entry, got %v", billingOnly)
	}

	domainOnly, err := s.ListOrganizationAudit(ctx, orgID, []string{"domain", "mailbox"}, time.Time{}, 10)
	if err != nil {
		t.Fatalf("list domain/mailbox: %v", err)
	}
	if len(domainOnly) != 1 || domainOnly[0].ObjectType != "domain" {
		t.Fatalf("expected exactly 1 domain entry, got %v", domainOnly)
	}
}

func TestListOrganizationAudit_TenantIsolation(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgA, ownerA := newTestOrgWithOwner(t, s)
	orgB, _ := newTestOrgWithOwner(t, s)

	if err := s.LogOrganizationAudit(ctx, orgA, &ownerA, "owner@example.com", "domain.created", "domain", "d1", "example.com", nil, ""); err != nil {
		t.Fatalf("log audit: %v", err)
	}

	entriesB, err := s.ListOrganizationAudit(ctx, orgB, nil, time.Time{}, 10)
	if err != nil {
		t.Fatalf("list org B audit: %v", err)
	}
	if len(entriesB) != 0 {
		t.Fatalf("org B should not see org A's audit entries, got %d", len(entriesB))
	}
}
