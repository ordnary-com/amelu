package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

type domainResponse struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Status         string  `json:"status"`
	DKIMSelector   *string `json:"dkimSelector,omitempty"`
	LastError      *string `json:"lastError,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	VerifiedAt     *string `json:"verifiedAt,omitempty"`
	Notes          string  `json:"notes"`
	PubliclyListed bool    `json:"publiclyListed"`
}

func toDomainResponse(d *db.Domain) domainResponse {
	resp := domainResponse{
		ID:             d.ID,
		Name:           d.Name,
		Status:         d.Status,
		CreatedAt:      d.CreatedAt.Format(http.TimeFormat),
		Notes:          d.Notes,
		PubliclyListed: d.PubliclyListed,
	}
	if d.DKIMSelector.Valid {
		resp.DKIMSelector = &d.DKIMSelector.String
	}
	if d.LastError.Valid {
		resp.LastError = &d.LastError.String
	}
	if d.VerifiedAt.Valid {
		formatted := d.VerifiedAt.Time.Format(http.TimeFormat)
		resp.VerifiedAt = &formatted
	}
	return resp
}

type createDomainRequest struct {
	Name string `json:"name"`
}

// CreateDomain creates the Domain principal in Stalwart. DNS is the
// customer's own responsibility — see GetDomainDNS for the records they
// need to add at their registrar and live verification of what's published.
func (a *App) CreateDomain(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}

	var req createDomainRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.ToLower(strings.TrimSpace(req.Name))
	if name == "" {
		writeError(w, http.StatusBadRequest, "domain name is required")
		return
	}

	maxDomains, _, err := a.Store.GetPlanTier(r.Context(), customer.PlanTierID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check plan limits")
		return
	}
	count, err := a.Store.CountDomains(r.Context(), customer.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check plan limits")
		return
	}
	if count >= maxDomains {
		writeError(w, http.StatusForbidden, "domain limit reached for your plan")
		return
	}

	domain, err := a.Store.CreateDomain(r.Context(), customer.ID, name)
	if err != nil {
		writeError(w, http.StatusConflict, "domain already exists or could not be created")
		return
	}

	if _, err := a.Stalwart.CreateDomain(r.Context(), name); err != nil {
		a.Store.UpdateDomainStatus(r.Context(), domain.ID, "failed", err.Error())
		writeError(w, http.StatusBadGateway, "failed to create domain in mail cluster: "+err.Error())
		return
	}
	a.Store.UpdateDomainStatus(r.Context(), domain.ID, "dns_pending", "")
	a.Store.LogActivity(r.Context(), domain.ID, "domain.created", "Domain "+name+" created")

	updated, err := a.Store.GetDomain(r.Context(), customer.ID, domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "domain created but could not reload status")
		return
	}
	writeJSON(w, http.StatusCreated, toDomainResponse(updated))
}

func (a *App) ListDomains(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}

	domains, err := a.Store.ListDomains(r.Context(), customer.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list domains")
		return
	}

	out := make([]domainResponse, 0, len(domains))
	for i := range domains {
		out = append(out, toDomainResponse(&domains[i]))
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *App) DeleteDomain(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domainID := r.PathValue("id")

	domain, err := a.Store.GetDomain(r.Context(), customer.ID, domainID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	if err := a.destroyDomainInStalwart(r.Context(), domain); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	if err := a.Store.DeleteDomain(r.Context(), customer.ID, domainID); err != nil {
		writeError(w, http.StatusInternalServerError, "domain removed from mail cluster but could not update records")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// destroyDomainInStalwart removes a domain and every mailbox under it from
// Stalwart. Shared by DeleteDomain and account termination, since both need
// the exact same cascade (Stalwart refuses to delete a Domain that still
// has linked Account objects).
func (a *App) destroyDomainInStalwart(ctx context.Context, domain *db.Domain) error {
	// A 'failed' domain never actually got created in Stalwart, so there's
	// nothing to remove there. And if it's already gone (e.g. removed
	// out-of-band), that's fine too - either way, just clean up our record.
	if domain.Status == "failed" {
		return nil
	}

	mailboxes, err := a.Store.ListMailboxes(ctx, domain.ID)
	if err != nil {
		return fmt.Errorf("could not list mailboxes for domain %s", domain.Name)
	}
	for _, m := range mailboxes {
		if err := a.Stalwart.DeleteMailbox(ctx, m.LocalPart, domain.Name); err != nil && !errors.Is(err, stalwart.ErrNotFound) {
			log.Printf("delete mailbox %s@%s in stalwart: %v", m.LocalPart, domain.Name, err)
			return fmt.Errorf("failed to delete mailbox %s in mail cluster: %w", m.LocalPart, err)
		}
	}

	if err := a.Stalwart.DeleteDomain(ctx, domain.Name); err != nil && !errors.Is(err, stalwart.ErrNotFound) {
		log.Printf("delete domain %s in stalwart: %v", domain.Name, err)
		return fmt.Errorf("failed to delete domain in mail cluster: %w", err)
	}
	return nil
}
