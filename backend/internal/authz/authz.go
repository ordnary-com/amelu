// Package authz centralizes the organization role permission checks used
// across the team/domain/mailbox/billing handlers. Never trust the
// frontend: every one of these is re-checked here, server-side, against
// the role resolved from organization_members for the request's actual
// organization - see internal/handlers/context.go's requireOrgActor.
package authz

import "amelu/backend/internal/db"

// CanManageTeam covers inviting members, changing roles, and removing
// members - owner and admin only.
func CanManageTeam(role string) bool {
	return role == db.RoleOwner || role == db.RoleAdmin
}

// CanAssignRole reports whether actorRole may set a member/invitation to
// newRole. Only an owner may grant or hold the owner role - an admin
// promoting someone to owner would be a privilege escalation an admin
// shouldn't have.
func CanAssignRole(actorRole, newRole string) bool {
	if !CanManageTeam(actorRole) {
		return false
	}
	if newRole == db.RoleOwner {
		return actorRole == db.RoleOwner
	}
	return true
}

// CanManageDomains covers creating domains and editing domain settings
// (notes, listing, DNS/spam/sieve rules, default services/limits) - owner
// and admin.
func CanManageDomains(role string) bool {
	return role == db.RoleOwner || role == db.RoleAdmin
}

// CanDeleteOrTransferDomain covers deleting or transferring domain
// ownership - owner only, since it can hand the domain to a different
// Amelu account entirely.
func CanDeleteOrTransferDomain(role string) bool {
	return role == db.RoleOwner
}

// CanManageMailboxes covers creating/deleting/suspending mailboxes and
// resetting mailbox passwords - owner, admin, and helpdesk.
func CanManageMailboxes(role string) bool {
	return role == db.RoleOwner || role == db.RoleAdmin || role == db.RoleHelpdesk
}

// CanManageBilling covers viewing and changing billing/subscription state -
// owner and billing only.
func CanManageBilling(role string) bool {
	return role == db.RoleOwner || role == db.RoleBilling
}

// CanViewBilling additionally allows read_only to view (but never change)
// billing information, matching "read_only: alles bekijken, niets
// wijzigen".
func CanViewBilling(role string) bool {
	return CanManageBilling(role) || role == db.RoleReadOnly
}

// VisibleAuditObjectTypes returns the set of organization_audit_log
// object_type values a role may see, or nil to mean "all of them" (owner,
// admin). helpdesk/read_only see only non-sensitive operational events
// (domain/mailbox); billing sees only billing events.
func VisibleAuditObjectTypes(role string) []string {
	switch role {
	case db.RoleOwner, db.RoleAdmin:
		return nil
	case db.RoleBilling:
		return []string{"billing"}
	default:
		return []string{"domain", "mailbox"}
	}
}
