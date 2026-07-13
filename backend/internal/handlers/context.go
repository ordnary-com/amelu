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
