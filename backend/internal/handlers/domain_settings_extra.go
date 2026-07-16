package handlers

import (
	"net/http"
	"strings"

	"amelu/backend/internal/authz"
)

// --- recent activity ---

type activityResponse struct {
	ID        string `json:"id"`
	EventType string `json:"eventType"`
	Message   string `json:"message"`
	CreatedAt string `json:"createdAt"`
}

func (a *App) GetActivity(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	entries, err := a.Store.ListActivity(r.Context(), domain.ID, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load activity")
		return
	}

	out := make([]activityResponse, 0, len(entries))
	for _, e := range entries {
		out = append(out, activityResponse{
			ID:        e.ID,
			EventType: e.EventType,
			Message:   e.Message,
			CreatedAt: e.CreatedAt.Format(http.TimeFormat),
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// --- attached notes ---

type updateDomainNotesRequest struct {
	Notes string `json:"notes"`
}

func (a *App) UpdateDomainNotes(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req updateDomainNotesRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateDomainNotes(r.Context(), domain.ID, req.Notes); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update notes")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"notes": req.Notes})
}

// --- listing settings ---

type updateDomainListingRequest struct {
	PubliclyListed bool `json:"publiclyListed"`
}

func (a *App) UpdateDomainListing(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req updateDomainListingRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateDomainListing(r.Context(), domain.ID, req.PubliclyListed); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update listing setting")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain.listing_updated", "Public listing setting changed")
	writeJSON(w, http.StatusOK, map[string]bool{"publiclyListed": req.PubliclyListed})
}

// --- transfer ownership ---

type transferDomainRequest struct {
	NewOwnerEmail string `json:"newOwnerEmail"`
}

// TransferDomain moves a domain to a different Amelu customer, identified by
// email. This only touches our own metadata - the Domain/Account objects in
// Stalwart aren't scoped to an Amelu customer at all, so there's nothing to
// change on the mail cluster side.
func (a *App) TransferDomain(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanDeleteOrTransferDomain(role) {
		writeError(w, http.StatusForbidden, "only the organization owner can transfer a domain")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req transferDomainRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.NewOwnerEmail))
	if email == "" {
		writeError(w, http.StatusBadRequest, "new owner email is required")
		return
	}

	newOwner, err := a.Store.GetCustomerByEmail(r.Context(), email)
	if err != nil {
		writeError(w, http.StatusNotFound, "no Amelu account found with that email")
		return
	}
	if newOwner.ID == customer.ID {
		writeError(w, http.StatusBadRequest, "domain is already owned by this account")
		return
	}

	if err := a.Store.TransferDomain(r.Context(), domain.ID, newOwner.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not transfer domain")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain.transferred", "Ownership transferred to "+email)
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"domain.transferred", "domain", domain.ID, domain.Name, map[string]any{"newOwnerEmail": email}, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
