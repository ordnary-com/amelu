package handlers

import (
	"net/http"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
)

// requireCustomer fetches the authenticated customer that auth.Require
// already attached to the request context. Routes calling this must be
// wrapped with auth.Require; if not, this is itself a 401 rather than a
// panic.
func requireCustomer(w http.ResponseWriter, r *http.Request) (*db.Customer, bool) {
	customer, ok := auth.CustomerFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return nil, false
	}
	return customer, true
}

// requireOrgActor is requireCustomer plus the acting customer's role in
// their own organization - the starting point for every team/domain/
// mailbox/billing handler that needs an authz.Can* check. A customer with
// no organization_members row (shouldn't happen outside a data bug, since
// signup and invitation acceptance always create one) gets a 500 rather
// than silently being treated as any particular role.
func (a *App) requireOrgActor(w http.ResponseWriter, r *http.Request) (customer *db.Customer, role string, ok bool) {
	customer, ok = requireCustomer(w, r)
	if !ok {
		return nil, "", false
	}
	if !customer.OrganizationID.Valid {
		writeError(w, http.StatusInternalServerError, "account has no organization")
		return nil, "", false
	}
	role, err := a.Store.GetMemberRole(r.Context(), customer.OrganizationID.String, customer.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not resolve organization role")
		return nil, "", false
	}
	return customer, role, true
}
