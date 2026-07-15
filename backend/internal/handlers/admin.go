package handlers

import (
	"errors"
	"net/http"
	"strings"

	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

// This file is the cross-customer admin surface used by Helm
// (ordnary-identity/apps/helm, via services/helm-api). Every route here is
// wrapped in auth.RequireAdmin (internal/auth/admin.go) - HMAC-signed,
// operator identity bound into the signature, unreachable without the
// AMELU_ADMIN_SHARED_SECRET. Never wire these under auth.Require (customer
// sessions) or expose them under /api/*.
//
// Every mutating action logs to the domain's activity log with an
// "[admin:<operator>] " prefix, so a support action is never indistinguishable
// from something the customer did themselves.

type adminCustomerSummary struct {
	ID               string  `json:"id"`
	Email            string  `json:"email"`
	Name             string  `json:"name"`
	Username         *string `json:"username,omitempty"`
	OrganizationID   string  `json:"organizationId"`
	OrganizationName string  `json:"organizationName"`
	PlanTierID       string  `json:"planTierId"`
	PlanTierName     string  `json:"planTierName"`
	LastSignInAt     *string `json:"lastSignInAt,omitempty"`
}

func toAdminCustomerSummary(p *db.CustomerProfile) adminCustomerSummary {
	out := adminCustomerSummary{
		ID:               p.ID,
		Email:            p.Email,
		Name:             p.Name,
		OrganizationID:   p.OrganizationID,
		OrganizationName: p.OrganizationName,
		PlanTierID:       p.PlanTierID,
		PlanTierName:     p.PlanTierName,
	}
	if p.Username.Valid {
		out.Username = &p.Username.String
	}
	if p.LastSignInAt.Valid {
		formatted := p.LastSignInAt.Time.Format(http.TimeFormat)
		out.LastSignInAt = &formatted
	}
	return out
}

// AdminSearchCustomers -> GET /internal/admin/customers?q=
func (a *App) AdminSearchCustomers(w http.ResponseWriter, r *http.Request, operator string) {
	query := r.URL.Query().Get("q")
	customers, err := a.Store.SearchCustomers(r.Context(), query, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not search customers")
		return
	}
	out := make([]adminCustomerSummary, 0, len(customers))
	for i := range customers {
		out = append(out, toAdminCustomerSummary(&customers[i]))
	}
	writeJSON(w, http.StatusOK, out)
}

type adminMailboxSummary struct {
	ID      string `json:"id"`
	Address string `json:"address"`
	Status  string `json:"status"`
}

type adminDomainSummary struct {
	domainResponse
	Mailboxes []adminMailboxSummary `json:"mailboxes"`
}

type adminCustomerDetail struct {
	adminCustomerSummary
	StripeCustomerID     *string              `json:"stripeCustomerId,omitempty"`
	StripeSubscriptionID *string              `json:"stripeSubscriptionId,omitempty"`
	SubscriptionStatus   *string              `json:"subscriptionStatus,omitempty"`
	BillingInterval      *string              `json:"billingInterval,omitempty"`
	Domains              []adminDomainSummary `json:"domains"`
}

// AdminGetCustomer -> GET /internal/admin/customers/{id}. Everything about a
// customer in one call: profile, billing/subscription state, and every
// domain with its mailboxes - this is the "see everything" view.
func (a *App) AdminGetCustomer(w http.ResponseWriter, r *http.Request, operator string) {
	customerID := r.PathValue("id")

	profile, err := a.Store.GetCustomerProfile(r.Context(), customerID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load customer")
		return
	}

	billing, err := a.Store.GetCustomerBilling(r.Context(), customerID)
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not load billing")
		return
	}

	domains, err := a.Store.ListDomains(r.Context(), customerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domains")
		return
	}

	detail := adminCustomerDetail{adminCustomerSummary: toAdminCustomerSummary(profile)}
	if billing != nil {
		if billing.StripeCustomerID.Valid {
			detail.StripeCustomerID = &billing.StripeCustomerID.String
		}
		if billing.StripeSubscriptionID.Valid {
			detail.StripeSubscriptionID = &billing.StripeSubscriptionID.String
		}
		if billing.SubscriptionStatus.Valid {
			detail.SubscriptionStatus = &billing.SubscriptionStatus.String
		}
		if billing.BillingInterval.Valid {
			detail.BillingInterval = &billing.BillingInterval.String
		}
	}

	detail.Domains = make([]adminDomainSummary, 0, len(domains))
	for i := range domains {
		d := &domains[i]
		mailboxes, err := a.Store.ListMailboxes(r.Context(), d.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load mailboxes")
			return
		}
		mailboxSummaries := make([]adminMailboxSummary, 0, len(mailboxes))
		for j := range mailboxes {
			m := &mailboxes[j]
			mailboxSummaries = append(mailboxSummaries, adminMailboxSummary{
				ID: m.ID, Address: m.LocalPart + "@" + d.Name, Status: m.Status,
			})
		}
		detail.Domains = append(detail.Domains, adminDomainSummary{
			domainResponse: toDomainResponse(d),
			Mailboxes:      mailboxSummaries,
		})
	}

	writeJSON(w, http.StatusOK, detail)
}

// AdminGetDomain -> GET /internal/admin/domains/{id}
func (a *App) AdminGetDomain(w http.ResponseWriter, r *http.Request, operator string) {
	domain, ok := a.loadAdminDomain(w, r)
	if !ok {
		return
	}
	mailboxes, err := a.Store.ListMailboxes(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load mailboxes")
		return
	}
	out := make([]mailboxResponse, 0, len(mailboxes))
	for i := range mailboxes {
		out = append(out, toMailboxResponse(&mailboxes[i], domain.Name))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"domain":    toDomainResponse(domain),
		"mailboxes": out,
	})
}

type adminUpdateDomainRequest struct {
	Notes          *string `json:"notes,omitempty"`
	PubliclyListed *bool   `json:"publiclyListed,omitempty"`
}

// AdminUpdateDomain -> PATCH /internal/admin/domains/{id}
func (a *App) AdminUpdateDomain(w http.ResponseWriter, r *http.Request, operator string) {
	domain, ok := a.loadAdminDomain(w, r)
	if !ok {
		return
	}
	var req adminUpdateDomainRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Notes != nil {
		if err := a.Store.UpdateDomainNotes(r.Context(), domain.ID, *req.Notes); err != nil {
			writeError(w, http.StatusInternalServerError, "could not update notes")
			return
		}
	}
	if req.PubliclyListed != nil {
		if err := a.Store.UpdateDomainListing(r.Context(), domain.ID, *req.PubliclyListed); err != nil {
			writeError(w, http.StatusInternalServerError, "could not update listing")
			return
		}
	}
	a.Store.LogActivity(r.Context(), domain.ID, "admin.domain.updated", "[admin:"+operator+"] Domain "+domain.Name+" updated")
	updated, err := a.Store.GetDomainByID(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "updated but could not reload")
		return
	}
	writeJSON(w, http.StatusOK, toDomainResponse(updated))
}

// AdminVerifyDomain -> POST /internal/admin/domains/{id}/verify. Force-marks
// a domain verified, bypassing the live DNS check - for support cases where
// the customer's DNS is confirmed correct out of band but the automated
// checker hasn't caught up yet.
func (a *App) AdminVerifyDomain(w http.ResponseWriter, r *http.Request, operator string) {
	domain, ok := a.loadAdminDomain(w, r)
	if !ok {
		return
	}
	if err := a.Store.MarkDomainVerified(r.Context(), domain.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify domain")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "admin.domain.verified", "[admin:"+operator+"] Domain "+domain.Name+" force-verified")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// AdminDeleteDomain -> DELETE /internal/admin/domains/{id}
func (a *App) AdminDeleteDomain(w http.ResponseWriter, r *http.Request, operator string) {
	domain, ok := a.loadAdminDomain(w, r)
	if !ok {
		return
	}
	if err := a.destroyDomainInStalwart(r.Context(), domain); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if err := a.Store.DeleteDomain(r.Context(), domain.CustomerID, domain.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "domain removed from mail cluster but could not update records")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) loadAdminDomain(w http.ResponseWriter, r *http.Request) (*db.Domain, bool) {
	domain, err := a.Store.GetDomainByID(r.Context(), r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return nil, false
	}
	return domain, true
}

// AdminGetMailbox -> GET /internal/admin/mailboxes/{id}
func (a *App) AdminGetMailbox(w http.ResponseWriter, r *http.Request, operator string) {
	mailbox, domain, ok := a.loadAdminMailbox(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toMailboxResponse(mailbox, domain.Name))
}

type adminUpdateMailboxRequest struct {
	Status      *string `json:"status,omitempty"` // "active" or "suspended"
	DisplayName *string `json:"displayName,omitempty"`
}

// AdminUpdateMailbox -> PATCH /internal/admin/mailboxes/{id}
func (a *App) AdminUpdateMailbox(w http.ResponseWriter, r *http.Request, operator string) {
	mailbox, domain, ok := a.loadAdminMailbox(w, r)
	if !ok {
		return
	}
	var req adminUpdateMailboxRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DisplayName != nil {
		if err := a.Store.UpdateMailboxDisplayName(r.Context(), mailbox.ID, *req.DisplayName); err != nil {
			writeError(w, http.StatusInternalServerError, "could not update display name")
			return
		}
	}
	if req.Status != nil {
		switch *req.Status {
		case "suspended":
			if err := a.Stalwart.SuspendMailbox(r.Context(), mailbox.LocalPart, domain.Name); err != nil {
				writeError(w, http.StatusBadGateway, "failed to suspend mailbox in mail cluster: "+err.Error())
				return
			}
		case "active":
			if err := a.Stalwart.ActivateMailbox(r.Context(), mailbox.LocalPart, domain.Name); err != nil {
				writeError(w, http.StatusBadGateway, "failed to activate mailbox in mail cluster: "+err.Error())
				return
			}
		default:
			writeError(w, http.StatusBadRequest, `status must be "active" or "suspended"`)
			return
		}
		if err := a.Store.UpdateMailboxStatus(r.Context(), mailbox.ID, *req.Status); err != nil {
			writeError(w, http.StatusInternalServerError, "mailbox updated in mail cluster but could not update records")
			return
		}
		mailbox.Status = *req.Status
	}
	a.Store.LogActivity(r.Context(), domain.ID, "admin.mailbox.updated", "[admin:"+operator+"] Mailbox "+mailbox.LocalPart+"@"+domain.Name+" updated")
	writeJSON(w, http.StatusOK, toMailboxResponse(mailbox, domain.Name))
}

// AdminDeleteMailbox -> DELETE /internal/admin/mailboxes/{id}
func (a *App) AdminDeleteMailbox(w http.ResponseWriter, r *http.Request, operator string) {
	mailbox, domain, ok := a.loadAdminMailbox(w, r)
	if !ok {
		return
	}
	if err := a.Stalwart.DeleteMailbox(r.Context(), mailbox.LocalPart, domain.Name); err != nil && !errors.Is(err, stalwart.ErrNotFound) {
		writeError(w, http.StatusBadGateway, "failed to delete mailbox in mail cluster: "+err.Error())
		return
	}
	if err := a.Store.DeleteMailbox(r.Context(), mailbox.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "mailbox removed from mail cluster but could not update records")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "admin.mailbox.deleted", "[admin:"+operator+"] Mailbox "+mailbox.LocalPart+"@"+domain.Name+" deleted")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type adminResetPasswordRequest struct {
	Email string `json:"email"`
}

// AdminResetMailboxPassword -> POST /internal/admin/mailboxes/{id}/reset-password.
// Sends the customer's own "set a new password" invite email to a recovery
// address Helm provides, rather than returning a plaintext password over the
// wire - Helm never needs to see or handle mailbox passwords itself.
func (a *App) AdminResetMailboxPassword(w http.ResponseWriter, r *http.Request, operator string) {
	mailbox, domain, ok := a.loadAdminMailbox(w, r)
	if !ok {
		return
	}
	if a.Resend == nil {
		writeError(w, http.StatusServiceUnavailable, "password reset emails aren't configured on this server")
		return
	}
	var req adminResetPasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	recipient := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(recipient, "@") {
		writeError(w, http.StatusBadRequest, "a valid recovery email address is required")
		return
	}
	if err := a.sendMailboxPasswordInvite(r, mailbox, domain, recipient); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "admin.mailbox.password_reset_sent", "[admin:"+operator+"] Password reset sent for "+mailbox.LocalPart+"@"+domain.Name+" to "+recipient)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) loadAdminMailbox(w http.ResponseWriter, r *http.Request) (*db.Mailbox, *db.Domain, bool) {
	mailbox, err := a.Store.GetMailbox(r.Context(), r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "mailbox not found")
		return nil, nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load mailbox")
		return nil, nil, false
	}
	domain, err := a.Store.GetDomainByID(r.Context(), mailbox.DomainID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return nil, nil, false
	}
	return mailbox, domain, true
}
