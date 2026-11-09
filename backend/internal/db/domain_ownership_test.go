package db

import (
	"context"
	"errors"
	"testing"
)

// Two customers may claim the same name, but only the first to verify gets it,
// and an unverified domain can't be pushed to another status around that.
func TestDomainOwnership_FirstToVerifyWins(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	_, ownerA := newTestOrgWithOwner(t, s)
	_, ownerB := newTestOrgWithOwner(t, s)
	name := "claimed-" + randomSuffix(t) + ".test"

	a, err := s.CreateDomain(ctx, ownerA, name, false)
	if err != nil {
		t.Fatalf("create A: %v", err)
	}
	b, err := s.CreateDomain(ctx, ownerB, name, false)
	if err != nil {
		t.Fatalf("an unverified claim must not block another customer: %v", err)
	}
	if a.Status != "unverified" || a.OwnershipVerifiedAt.Valid || a.VerificationToken == "" || a.VerificationToken == b.VerificationToken {
		t.Fatalf("unexpected new domain: %+v", a)
	}
	if _, err := s.CreateDomain(ctx, ownerA, name, false); err == nil {
		t.Fatal("the same customer must not claim a name twice")
	}

	if err := s.MarkDomainVerified(ctx, a.ID); err != nil {
		t.Fatalf("MarkDomainVerified: %v", err)
	}
	if err := s.UpdateDomainStatus(ctx, a.ID, "active", ""); err != nil {
		t.Fatalf("UpdateDomainStatus: %v", err)
	}
	if status, _ := s.DomainStatus(ctx, a.ID); status != "unverified" {
		t.Fatalf("an unverified domain must stay unverified, got %q", status)
	}

	if err := s.MarkDomainOwnershipVerified(ctx, b.ID); err != nil {
		t.Fatalf("verify B: %v", err)
	}
	if err := s.MarkDomainOwnershipVerified(ctx, a.ID); !errors.Is(err, ErrDomainTaken) {
		t.Fatalf("expected ErrDomainTaken for the second to verify, got %v", err)
	}
	if status, _ := s.DomainStatus(ctx, b.ID); status != "provisioning" {
		t.Fatalf("expected provisioning after verification, got %q", status)
	}
}
