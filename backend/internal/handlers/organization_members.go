package handlers

import (
	"errors"
	"net/http"
	"strings"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
)

func requestIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i != -1 {
		host = host[:i]
	}
	return host
}

type memberResponse struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	CreatedAt string `json:"createdAt"`
	IsSelf    bool   `json:"isSelf"`
}

func toMemberResponse(m *db.OrganizationMember, actingCustomerID string) memberResponse {
	return memberResponse{
		ID:        m.CustomerID,
		Email:     m.Email,
		Name:      m.Name,
		Role:      m.Role,
		CreatedAt: m.CreatedAt.Format(http.TimeFormat),
		IsSelf:    m.CustomerID == actingCustomerID,
	}
}

// ListOrganizationMembers backs the team roster on MyOrganizationPage -
// visible to every role, since read_only members can view everything.
func (a *App) ListOrganizationMembers(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}

	members, err := a.Store.ListOrganizationMembers(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list members")
		return
	}

	out := make([]memberResponse, 0, len(members))
	for i := range members {
		out = append(out, toMemberResponse(&members[i], customer.ID))
	}
	writeJSON(w, http.StatusOK, out)
}

type updateMemberRoleRequest struct {
	Role string `json:"role"`
}

// UpdateMemberRole changes a teammate's role. Owner and admin only; an
// admin may never grant the owner role (authz.CanAssignRole); nobody may
// change their own role via this endpoint (blocks both self-elevation and
// self-demotion out of a role that might be the org's last owner); and the
// store layer itself refuses to demote the organization's last owner even
// under concurrent requests (see db.UpdateMemberRole).
func (a *App) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageTeam(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage the team")
		return
	}

	targetCustomerID := r.PathValue("id")
	if targetCustomerID == customer.ID {
		writeError(w, http.StatusForbidden, "you cannot change your own role")
		return
	}

	var req updateMemberRoleRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !isValidRole(req.Role) {
		writeError(w, http.StatusBadRequest, "invalid role")
		return
	}
	if !authz.CanAssignRole(role, req.Role) {
		writeError(w, http.StatusForbidden, "you don't have permission to assign this role")
		return
	}

	// Confirm the target is actually in this organization before touching
	// anything - tenant isolation for a customer ID from another org.
	target, err := a.Store.GetMemberRole(r.Context(), customer.OrganizationID.String, targetCustomerID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "member not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load member")
		return
	}

	if err := a.Store.UpdateMemberRole(r.Context(), customer.OrganizationID.String, targetCustomerID, req.Role); err != nil {
		if errors.Is(err, db.ErrLastOwner) {
			writeError(w, http.StatusConflict, "the organization must keep at least one owner")
			return
		}
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "member not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not update role")
		return
	}

	targetCustomer, err := a.Store.GetCustomerByID(r.Context(), targetCustomerID)
	label := targetCustomerID
	if err == nil {
		label = targetCustomer.Email
	}
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"member.role_changed", "member", targetCustomerID, label,
		map[string]any{"from": target, "to": req.Role}, requestIP(r))

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// RemoveMember revokes a teammate's access entirely (deletes their Amelu
// account - see db.RemoveMember). Owner and admin only; nobody may remove
// themselves this way, and the store layer refuses to remove the last
// owner.
func (a *App) RemoveMember(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageTeam(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage the team")
		return
	}

	targetCustomerID := r.PathValue("id")
	if targetCustomerID == customer.ID {
		writeError(w, http.StatusForbidden, "you cannot remove yourself from the organization")
		return
	}

	target, err := a.Store.GetCustomerByID(r.Context(), targetCustomerID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "member not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load member")
		return
	}
	if !target.OrganizationID.Valid || target.OrganizationID.String != customer.OrganizationID.String {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}

	if err := a.Store.RemoveMember(r.Context(), customer.OrganizationID.String, targetCustomerID); err != nil {
		if errors.Is(err, db.ErrLastOwner) {
			writeError(w, http.StatusConflict, "the organization must keep at least one owner")
			return
		}
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "member not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not remove member")
		return
	}

	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"member.removed", "member", targetCustomerID, target.Email, nil, requestIP(r))

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func isValidRole(role string) bool {
	switch role {
	case db.RoleOwner, db.RoleAdmin, db.RoleHelpdesk, db.RoleBilling, db.RoleReadOnly:
		return true
	default:
		return false
	}
}
