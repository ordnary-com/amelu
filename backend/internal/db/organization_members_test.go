package db

import (
	"context"
	"errors"
	"testing"
)

func TestGetMemberRole_TenantIsolation(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	orgA, ownerA := newTestOrgWithOwner(t, s)
	orgB, _ := newTestOrgWithOwner(t, s)

	if _, err := s.GetMemberRole(ctx, orgB, ownerA); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound looking up org A's owner under org B, got %v", err)
	}

	role, err := s.GetMemberRole(ctx, orgA, ownerA)
	if err != nil {
		t.Fatalf("GetMemberRole: %v", err)
	}
	if role != RoleOwner {
		t.Fatalf("expected role %q, got %q", RoleOwner, role)
	}
}

func TestUpdateMemberRole_RefusesDemotingLastOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)

	if err := s.UpdateMemberRole(ctx, orgID, ownerID, RoleAdmin); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("expected ErrLastOwner demoting the sole owner, got %v", err)
	}

	role, err := s.GetMemberRole(ctx, orgID, ownerID)
	if err != nil {
		t.Fatalf("GetMemberRole: %v", err)
	}
	if role != RoleOwner {
		t.Fatalf("owner role should be unchanged after refused demotion, got %q", role)
	}
}

func TestUpdateMemberRole_AllowsDemotingWithAnotherOwnerPresent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	secondOwnerID := newTestMember(t, s, orgID, RoleOwner)

	if err := s.UpdateMemberRole(ctx, orgID, ownerID, RoleAdmin); err != nil {
		t.Fatalf("expected demotion to succeed with a second owner present: %v", err)
	}

	role, err := s.GetMemberRole(ctx, orgID, ownerID)
	if err != nil {
		t.Fatalf("GetMemberRole: %v", err)
	}
	if role != RoleAdmin {
		t.Fatalf("expected role %q after demotion, got %q", RoleAdmin, role)
	}

	// second owner is now the organization's only owner - demoting them
	// should now be refused.
	if err := s.UpdateMemberRole(ctx, orgID, secondOwnerID, RoleAdmin); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("expected ErrLastOwner demoting the now-sole owner, got %v", err)
	}
}

func TestRemoveMember_RefusesRemovingLastOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	// A non-owner teammate also exists, so this isn't "removing the last
	// member" - specifically the last *owner* invariant must fire.
	newTestMember(t, s, orgID, RoleHelpdesk)

	if err := s.RemoveMember(ctx, orgID, ownerID); !errors.Is(err, ErrLastOwner) {
		t.Fatalf("expected ErrLastOwner removing the sole owner, got %v", err)
	}
}

func TestRemoveMember_AllowsRemovingNonOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, _ := newTestOrgWithOwner(t, s)
	helpdeskID := newTestMember(t, s, orgID, RoleHelpdesk)

	if err := s.RemoveMember(ctx, orgID, helpdeskID); err != nil {
		t.Fatalf("expected removal of non-owner member to succeed: %v", err)
	}

	if _, err := s.GetCustomerByID(ctx, helpdeskID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected removed member's customer row to be deleted, got %v", err)
	}
}

func TestRemoveMember_ReassignsDomainsToRemainingOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	adminID := newTestMember(t, s, orgID, RoleAdmin)

	domain, err := s.CreateDomain(ctx, adminID, "example-"+randomSuffix(t)+".test")
	if err != nil {
		t.Fatalf("create domain: %v", err)
	}

	if err := s.RemoveMember(ctx, orgID, adminID); err != nil {
		t.Fatalf("remove member: %v", err)
	}

	reloaded, err := s.GetDomainForOrganization(ctx, orgID, domain.ID)
	if err != nil {
		t.Fatalf("domain should still be visible to the organization after its creator is removed: %v", err)
	}
	if reloaded.CustomerID != ownerID {
		t.Fatalf("expected domain to be reassigned to remaining owner %s, got %s", ownerID, reloaded.CustomerID)
	}
}

func TestListOrganizationMembers_ScopedToOrganization(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgA, _ := newTestOrgWithOwner(t, s)
	orgB, _ := newTestOrgWithOwner(t, s)
	newTestMember(t, s, orgA, RoleAdmin)

	members, err := s.ListOrganizationMembers(ctx, orgA)
	if err != nil {
		t.Fatalf("ListOrganizationMembers: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("expected 2 members in org A, got %d", len(members))
	}
	for _, m := range members {
		if m.OrganizationID != orgA {
			t.Fatalf("member %s leaked from a different organization", m.CustomerID)
		}
	}

	membersB, err := s.ListOrganizationMembers(ctx, orgB)
	if err != nil {
		t.Fatalf("ListOrganizationMembers: %v", err)
	}
	if len(membersB) != 1 {
		t.Fatalf("expected 1 member in org B, got %d", len(membersB))
	}
}
