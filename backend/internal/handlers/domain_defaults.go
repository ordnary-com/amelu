package handlers

import "net/http"

// Default Services and Default Limits are templates only - they're read
// once, at the moment a new mailbox is created (see
// applyDomainDefaultsToMailbox in mailboxes.go), and have no effect on
// mailboxes that already exist. Saving here never touches Stalwart.

// --- default services ---

func (a *App) GetDomainDefaultServices(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, enabledServicesResponse{
		MaySend:    domain.DefaultMaySend,
		MayReceive: domain.DefaultMayReceive,
		MayIMAP:    domain.DefaultMayIMAP,
		MayPOP3:    domain.DefaultMayPOP3,
		MaySieve:   domain.DefaultMaySieve,
	})
}

func (a *App) UpdateDomainDefaultServices(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}

	var req enabledServicesResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateDomainDefaultServices(r.Context(), domain.ID, req.MaySend, req.MayReceive, req.MayIMAP, req.MayPOP3, req.MaySieve); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save default services")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain.default_services_updated", "Updated default mailbox services for new mailboxes")
	writeJSON(w, http.StatusOK, req)
}

// --- default limits ---

type domainDefaultLimitsResponse struct {
	MaxEmails         int64 `json:"maxEmails"`
	MaxDiskQuotaBytes int64 `json:"maxDiskQuotaBytes"`
}

func (a *App) GetDomainDefaultLimits(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, domainDefaultLimitsResponse{
		MaxEmails:         domain.DefaultMaxEmails,
		MaxDiskQuotaBytes: domain.DefaultMaxDiskQuota,
	})
}

func (a *App) UpdateDomainDefaultLimits(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.ID, r.PathValue("id"))
	if !ok {
		return
	}

	var req domainDefaultLimitsResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MaxEmails < 0 || req.MaxDiskQuotaBytes < 0 {
		writeError(w, http.StatusBadRequest, "limits cannot be negative")
		return
	}

	if err := a.Store.UpdateDomainDefaultLimits(r.Context(), domain.ID, req.MaxEmails, req.MaxDiskQuotaBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save default limits")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain.default_limits_updated", "Updated default mailbox limits for new mailboxes")
	writeJSON(w, http.StatusOK, req)
}
