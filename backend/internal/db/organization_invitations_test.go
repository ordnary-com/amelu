package db

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestCreateInvitation_RejectsDuplicateOpenInvite(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	email := "invitee-" + randomSuffix(t) + "@example.com"

	if _, err := s.CreateInvitation(ctx, orgID, email, RoleAdmin, "hash1"+randomSuffix(t), ownerID, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("first invitation should succeed: %v", err)
	}
	if _, err := s.CreateInvitation(ctx, orgID, email, RoleReadOnly, "hash2"+randomSuffix(t), ownerID, time.Now().Add(time.Hour)); !errors.Is(err, ErrInvitationExists) {
		t.Fatalf("expected ErrInvitationExists for a duplicate open invite, got %v", err)
	}

	// Case-insensitive: same address, different case, still conflicts.
	upper := "INVITEE-" + email[len("invitee-"):]
	if _, err := s.CreateInvitation(ctx, orgID, upper, RoleReadOnly, "hash3"+randomSuffix(t), ownerID, time.Now().Add(time.Hour)); !errors.Is(err, ErrInvitationExists) {
		t.Fatalf("expected ErrInvitationExists for a case-insensitive duplicate, got %v", err)
	}
}

func TestCreateInvitation_SupersedesExpiredInvite(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	email := "invitee-" + randomSuffix(t) + "@example.com"

	if _, err := s.CreateInvitation(ctx, orgID, email, RoleAdmin, "hashA"+randomSuffix(t), ownerID, time.Now().Add(-time.Hour)); err != nil {
		t.Fatalf("create expired invitation: %v", err)
	}

	// The prior invitation already expired, so a fresh one for the same
	// email must be allowed rather than blocked as a duplicate.
	if _, err := s.CreateInvitation(ctx, orgID, email, RoleReadOnly, "hashB"+randomSuffix(t), ownerID, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("expected re-invite to supersede the expired invitation, got %v", err)
	}
}

func TestAcceptInvitationForNewCustomer_OneTimeUse(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	email := "invitee-" + randomSuffix(t) + "@example.com"

	inv, err := s.CreateInvitation(ctx, orgID, email, RoleReadOnly, "hash"+randomSuffix(t), ownerID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	suffix := randomSuffix(t)
	customer, err := s.AcceptInvitationForNewCustomer(ctx, inv.ID, orgID, inv.Role, email, "Invitee Test", "hash", "Invitee", "Test", "invitee"+suffix)
	if err != nil {
		t.Fatalf("first accept should succeed: %v", err)
	}
	t.Cleanup(func() { s.DeleteCustomer(context.Background(), customer.ID) })

	role, err := s.GetMemberRole(ctx, orgID, customer.ID)
	if err != nil {
		t.Fatalf("GetMemberRole after accept: %v", err)
	}
	if role != RoleReadOnly {
		t.Fatalf("expected accepted member to have invited role %q, got %q", RoleReadOnly, role)
	}

	// Simulate a concurrent duplicate accept of the same token: the second
	// call must fail since the invitation is already marked accepted.
	if _, err := s.AcceptInvitationForNewCustomer(ctx, inv.ID, orgID, inv.Role, email, "Invitee Test", "hash", "Invitee", "Test", "invitee2"+suffix); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected second accept of the same invitation to fail with ErrNotFound, got %v", err)
	}
}

func TestRevokeInvitation_BlocksLaterAccept(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	email := "invitee-" + randomSuffix(t) + "@example.com"

	inv, err := s.CreateInvitation(ctx, orgID, email, RoleReadOnly, "hash"+randomSuffix(t), ownerID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	if err := s.RevokeInvitation(ctx, orgID, inv.ID); err != nil {
		t.Fatalf("revoke invitation: %v", err)
	}

	// Revoking while a concurrent accept is in flight (or after, as here)
	// must make the accept fail rather than let it silently succeed.
	if _, err := s.AcceptInvitationForNewCustomer(ctx, inv.ID, orgID, inv.Role, email, "Invitee Test", "hash", "Invitee", "Test", "invitee"+randomSuffix(t)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected accept of a revoked invitation to fail with ErrNotFound, got %v", err)
	}
}

func TestRevokeInvitation_TenantIsolation(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgA, ownerA := newTestOrgWithOwner(t, s)
	orgB, _ := newTestOrgWithOwner(t, s)
	email := "invitee-" + randomSuffix(t) + "@example.com"

	inv, err := s.CreateInvitation(ctx, orgA, email, RoleReadOnly, "hash"+randomSuffix(t), ownerA, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	// Org B must not be able to revoke org A's invitation by ID.
	if err := s.RevokeInvitation(ctx, orgB, inv.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound revoking another organization's invitation, got %v", err)
	}

	// It's still revocable by its actual organization.
	if err := s.RevokeInvitation(ctx, orgA, inv.ID); err != nil {
		t.Fatalf("owning organization should still be able to revoke it: %v", err)
	}
}
