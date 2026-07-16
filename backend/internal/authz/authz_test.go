package authz_test

import (
	"testing"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
)

func TestCanManageTeam(t *testing.T) {
	cases := map[string]bool{
		db.RoleOwner:    true,
		db.RoleAdmin:    true,
		db.RoleHelpdesk: false,
		db.RoleBilling:  false,
		db.RoleReadOnly: false,
	}
	for role, want := range cases {
		if got := authz.CanManageTeam(role); got != want {
			t.Errorf("CanManageTeam(%s) = %v, want %v", role, got, want)
		}
	}
}

func TestCanAssignRole(t *testing.T) {
	// Admin can assign any non-owner role, but never owner.
	if authz.CanAssignRole(db.RoleAdmin, db.RoleOwner) {
		t.Error("admin should not be able to assign the owner role")
	}
	if !authz.CanAssignRole(db.RoleAdmin, db.RoleAdmin) {
		t.Error("admin should be able to assign the admin role")
	}
	if !authz.CanAssignRole(db.RoleAdmin, db.RoleHelpdesk) {
		t.Error("admin should be able to assign the helpdesk role")
	}
	// Owner can assign any role including owner.
	if !authz.CanAssignRole(db.RoleOwner, db.RoleOwner) {
		t.Error("owner should be able to assign the owner role")
	}
	// Non-team-managers can never assign any role.
	for _, role := range []string{db.RoleHelpdesk, db.RoleBilling, db.RoleReadOnly} {
		if authz.CanAssignRole(role, db.RoleReadOnly) {
			t.Errorf("%s should not be able to assign any role", role)
		}
	}
}

func TestCanManageDomains(t *testing.T) {
	cases := map[string]bool{
		db.RoleOwner:    true,
		db.RoleAdmin:    true,
		db.RoleHelpdesk: false,
		db.RoleBilling:  false,
		db.RoleReadOnly: false,
	}
	for role, want := range cases {
		if got := authz.CanManageDomains(role); got != want {
			t.Errorf("CanManageDomains(%s) = %v, want %v", role, got, want)
		}
	}
}

func TestCanDeleteOrTransferDomain(t *testing.T) {
	if !authz.CanDeleteOrTransferDomain(db.RoleOwner) {
		t.Error("owner should be able to delete/transfer a domain")
	}
	for _, role := range []string{db.RoleAdmin, db.RoleHelpdesk, db.RoleBilling, db.RoleReadOnly} {
		if authz.CanDeleteOrTransferDomain(role) {
			t.Errorf("%s should not be able to delete/transfer a domain", role)
		}
	}
}

func TestCanManageMailboxes(t *testing.T) {
	cases := map[string]bool{
		db.RoleOwner:    true,
		db.RoleAdmin:    true,
		db.RoleHelpdesk: true,
		db.RoleBilling:  false,
		db.RoleReadOnly: false,
	}
	for role, want := range cases {
		if got := authz.CanManageMailboxes(role); got != want {
			t.Errorf("CanManageMailboxes(%s) = %v, want %v", role, got, want)
		}
	}
}

func TestCanManageBilling(t *testing.T) {
	cases := map[string]bool{
		db.RoleOwner:    true,
		db.RoleAdmin:    false,
		db.RoleHelpdesk: false,
		db.RoleBilling:  true,
		db.RoleReadOnly: false,
	}
	for role, want := range cases {
		if got := authz.CanManageBilling(role); got != want {
			t.Errorf("CanManageBilling(%s) = %v, want %v", role, got, want)
		}
	}
}

func TestCanViewBilling(t *testing.T) {
	if !authz.CanViewBilling(db.RoleReadOnly) {
		t.Error("read_only should be able to view billing")
	}
	if authz.CanViewBilling(db.RoleAdmin) {
		t.Error("admin should not be able to view billing")
	}
	if authz.CanViewBilling(db.RoleHelpdesk) {
		t.Error("helpdesk should not be able to view billing")
	}
}

func TestVisibleAuditObjectTypes(t *testing.T) {
	if authz.VisibleAuditObjectTypes(db.RoleOwner) != nil {
		t.Error("owner should see all audit object types (nil)")
	}
	if authz.VisibleAuditObjectTypes(db.RoleAdmin) != nil {
		t.Error("admin should see all audit object types (nil)")
	}

	billingTypes := authz.VisibleAuditObjectTypes(db.RoleBilling)
	if len(billingTypes) != 1 || billingTypes[0] != "billing" {
		t.Errorf("billing role should only see billing events, got %v", billingTypes)
	}

	for _, role := range []string{db.RoleHelpdesk, db.RoleReadOnly} {
		types := authz.VisibleAuditObjectTypes(role)
		found := map[string]bool{}
		for _, ty := range types {
			found[ty] = true
		}
		if found["billing"] || found["member"] || found["invitation"] {
			t.Errorf("%s should not see sensitive audit object types, got %v", role, types)
		}
		if !found["domain"] || !found["mailbox"] {
			t.Errorf("%s should see operational audit object types, got %v", role, types)
		}
	}
}
