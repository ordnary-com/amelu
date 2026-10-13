package handlers

import (
	"errors"
	"net/http"

	"amelu/backend/internal/db"
)

type domainFavoriteRequest struct {
	Favorite bool `json:"favorite"`
}

// SetDomainFavorite stars or unstars a domain for the signed-in customer only.
// Any role may do it: it changes nothing about the domain itself.
func (a *App) SetDomainFavorite(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req domainFavoriteRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	domainID := r.PathValue("id")
	if _, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, domainID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	if err := a.Store.SetDomainFavorite(r.Context(), customer.ID, domainID, req.Favorite); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save favorite")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"favorite": req.Favorite})
}

type domainOrderRequest struct {
	DomainIDs []string `json:"domainIds"`
}

// SetDomainOrder stores the signed-in customer's drag-and-drop order. The list
// may leave domains out (they go after the ordered ones) but may not name a
// domain twice or one from another organization.
func (a *App) SetDomainOrder(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req domainOrderRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	domains, err := a.Store.ListDomainsForOrganization(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list domains")
		return
	}
	known := make(map[string]bool, len(domains))
	for _, d := range domains {
		known[d.ID] = true
	}
	seen := make(map[string]bool, len(req.DomainIDs))
	for _, id := range req.DomainIDs {
		if !known[id] || seen[id] {
			writeError(w, http.StatusBadRequest, "domainIds must list each of your domains at most once")
			return
		}
		seen[id] = true
	}

	if err := a.Store.SetDomainOrder(r.Context(), customer.ID, req.DomainIDs); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save order")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
