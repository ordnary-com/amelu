package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
	"amelu/backend/internal/dnscheck"
	"amelu/backend/internal/stalwart"
)

type domainResponse struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Status       string  `json:"status"`
	DKIMSelector *string `json:"dkimSelector,omitempty"`
	LastError    *string `json:"lastError,omitempty"`
	CreatedAt    string  `json:"createdAt"`
	VerifiedAt   *string `json:"verifiedAt,omitempty"`
	// The TXT record that proves ownership; only set while status is "unverified".
	Verification *verificationRecord `json:"verification,omitempty"`
	// The TXT value that proves ownership of a domain alias added to this domain.
	OwnershipValue string `json:"ownershipValue"`
	Notes          string `json:"notes"`
	PubliclyListed bool   `json:"publiclyListed"`
	// The signed-in customer's own arrangement; only set by ListDomains.
	Favorite bool `json:"favorite"`
	Position *int `json:"position,omitempty"`
}

func toDomainResponse(d *db.Domain) domainResponse {
	resp := domainResponse{
		ID:             d.ID,
		Name:           d.Name,
		Status:         d.Status,
		CreatedAt:      d.CreatedAt.Format(http.TimeFormat),
		Notes:          d.Notes,
		PubliclyListed: d.PubliclyListed,
		OwnershipValue: dnscheck.OwnershipRecordValue(d.VerificationToken),
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
	if !d.OwnershipVerifiedAt.Valid {
		resp.Verification = ownershipRecord(d.Name, d.VerificationToken)
	}
	return resp
}

type verificationRecord struct {
	Type  string `json:"type"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

func ownershipRecord(name, token string) *verificationRecord {
	return &verificationRecord{Type: "TXT", Name: dnscheck.OwnershipRecordName(name), Value: dnscheck.OwnershipRecordValue(token)}
}

type createDomainRequest struct {
	Name string `json:"name"`
	// Nameservers is "amelu" to have Amelu host the domain's DNS; anything
	// else keeps the DNS where it is.
	Nameservers string `json:"nameservers"`
}

// CreateDomain records the customer's claim on a domain, unverified. It only
// reaches Stalwart once VerifyDomainOwnership finds the TXT record: Stalwart
// treats every domain it hosts as local, so an unproven domain there would
// make every Amelu sender bounce on mail to it, or deliver it to whoever
// added it (hotmail.com was, on 2026-11-05).
func (a *App) CreateDomain(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
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
	useAmeluDNS := req.Nameservers == "amelu"
	if useAmeluDNS && a.AmeluDNS == nil {
		writeError(w, http.StatusServiceUnavailable, "Amelu nameservers aren't available yet")
		return
	}
	if isReservedDomain(name) {
		writeError(w, http.StatusForbidden, reservedDomainMessage(name))
		return
	}

	planTierID, err := a.Store.GetOrganizationPlanTierID(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check plan limits")
		return
	}
	maxDomains, _, err := a.Store.GetPlanTier(r.Context(), planTierID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check plan limits")
		return
	}
	count, err := a.Store.CountDomainsForOrganization(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check plan limits")
		return
	}
	if count >= maxDomains {
		writeError(w, http.StatusForbidden, "domain limit reached for your plan")
		return
	}

	domain, err := a.Store.CreateDomain(r.Context(), customer.ID, name, useAmeluDNS)
	if err != nil {
		writeError(w, http.StatusConflict, "you've already added this domain")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain.created", "Domain "+name+" added, waiting for ownership verification")
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"domain.created", "domain", domain.ID, name, nil, requestIP(r))
	writeJSON(w, http.StatusCreated, toDomainResponse(domain))
}

// VerifyDomainOwnership looks up the domain's _amelu TXT record and, once it's
// there, sets the domain up in Stalwart.
func (a *App) VerifyDomainOwnership(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}
	switch {
	case domain.OwnershipVerifiedAt.Valid && domain.Status != "provisioning" && domain.Status != "failed":
		writeJSON(w, http.StatusOK, toDomainResponse(domain))
		return
	case domain.OwnershipVerifiedAt.Valid:
		// Verified before, but the mail cluster setup didn't finish: retry just that.
		a.finishVerifiedDomain(w, r, customer.OrganizationID.String, domain)
		return
	}
	if !dnscheck.HasOwnershipRecord(r.Context(), domain.Name, domain.VerificationToken) {
		writeError(w, http.StatusConflict, "the TXT record isn't there yet. DNS changes can take a few minutes to show up")
		return
	}
	if err := a.Store.MarkDomainOwnershipVerified(r.Context(), domain.ID); errors.Is(err, db.ErrDomainTaken) {
		writeError(w, http.StatusConflict, "another Amelu customer has already verified this domain. Contact support if it's yours")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save the verification")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain.ownership_verified", "Ownership of "+domain.Name+" verified")
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"domain.ownership_verified", "domain", domain.ID, domain.Name, nil, requestIP(r))

	a.finishVerifiedDomain(w, r, customer.OrganizationID.String, domain)
}

func (a *App) finishVerifiedDomain(w http.ResponseWriter, r *http.Request, organizationID string, domain *db.Domain) {
	if err := a.provisionDomain(r.Context(), domain); err != nil {
		writeUpstreamError(w, "ownership is verified, but the mail cluster couldn't set the domain up. Try again in a moment", err)
		return
	}
	updated, err := a.Store.GetDomainForOrganization(r.Context(), organizationID, domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "domain verified but could not reload status")
		return
	}
	writeJSON(w, http.StatusOK, toDomainResponse(updated))
}

// provisionDomain creates a verified domain in Stalwart and, if that was
// asked for when adding it, moves its DNS to the Amelu nameservers. On a
// Stalwart failure the domain is marked failed with ownership kept, so a
// retry through VerifyDomainOwnership's caller (or support) can finish it.
func (a *App) provisionDomain(ctx context.Context, domain *db.Domain) error {
	// A new domain on a paid plan gets that plan's sending limit right away.
	defer a.RequestSendingLimitsSync()
	name := domain.Name
	if _, err := a.Stalwart.CreateDomain(ctx, name); err != nil {
		log.Printf("create domain %s in stalwart: %v", name, err)
		a.Store.UpdateDomainStatus(ctx, domain.ID, "failed", err.Error())
		return err
	}
	a.Store.UpdateDomainStatus(ctx, domain.ID, "dns_pending", "")
	if domain.WantsAmeluDNS && a.AmeluDNS != nil {
		// The domain works either way; if hosting fails it simply keeps its own
		// DNS, and the DNS page offers the switch again.
		if err := a.hostDomainDNS(ctx, domain); err != nil {
			log.Printf("host DNS for %s on Amelu nameservers: %v", name, err)
			a.Store.LogActivity(ctx, domain.ID, "domain.nameservers_failed", err.Error())
		}
	}
	return nil
}

func (a *App) ListDomains(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}

	domains, err := a.Store.ListDomainsForOrganization(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list domains")
		return
	}

	prefs, err := a.Store.ListDomainPreferences(r.Context(), customer.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list domains")
		return
	}

	out := make([]domainResponse, 0, len(domains))
	for i := range domains {
		resp := toDomainResponse(&domains[i])
		if p, ok := prefs[domains[i].ID]; ok {
			resp.Favorite = p.Favorite
			if p.Position.Valid {
				position := int(p.Position.Int32)
				resp.Position = &position
			}
		}
		out = append(out, resp)
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *App) DeleteDomain(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanDeleteOrTransferDomain(role) {
		writeError(w, http.StatusForbidden, "only the organization owner can delete a domain")
		return
	}
	domainID := r.PathValue("id")

	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, domainID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	if err := a.destroyDomainInStalwart(r.Context(), domain); err != nil {
		writeUpstreamError(w, "", err)
		return
	}
	a.releaseDomainZone(r.Context(), domain)

	if err := a.Store.DeleteDomainForOrganization(r.Context(), customer.OrganizationID.String, domainID); err != nil {
		writeError(w, http.StatusInternalServerError, "domain removed from mail cluster but could not update records")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"domain.deleted", "domain", domainID, domain.Name, nil, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// destroyDomainInStalwart removes a domain and every mailbox under it from
// Stalwart. Shared by DeleteDomain and account termination, since both need
// the exact same cascade (Stalwart refuses to delete a Domain that still
// has linked Account objects).
func (a *App) destroyDomainInStalwart(ctx context.Context, domain *db.Domain) error {
	// A 'failed' or 'unverified' domain never actually got created in Stalwart, so there's
	// nothing to remove there. And if it's already gone (e.g. removed
	// out-of-band), that's fine too - either way, just clean up our record.
	if domain.Status == "failed" || domain.Status == "unverified" {
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

// releaseDomainZone deletes the zone Amelu hosted for a removed domain, so
// the name can be added again, here or anywhere else.
func (a *App) releaseDomainZone(ctx context.Context, domain *db.Domain) {
	zone, err := a.Store.GetDNSZone(ctx, domain.ID)
	if err != nil || a.AmeluDNS == nil {
		return
	}
	if err := a.AmeluDNS.DeleteZone(ctx, zone.ZoneID); err != nil {
		log.Printf("delete zone %s for %s: %v", zone.ZoneID, domain.Name, err)
		return
	}
	a.Store.DeleteDNSZone(ctx, domain.ID)
}
