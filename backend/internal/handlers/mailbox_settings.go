package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

// requireMailboxManage is the shared gate for every mutating mailbox-settings
// handler in this file - owner, admin, and helpdesk.
func (a *App) requireMailboxManage(w http.ResponseWriter, r *http.Request) (*db.Customer, bool) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return nil, false
	}
	if !authz.CanManageMailboxes(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage mailboxes")
		return nil, false
	}
	return customer, true
}

// --- Enabled Services ---

type enabledServicesResponse struct {
	MaySend    bool `json:"maySend"`
	MayReceive bool `json:"mayReceive"`
	MayIMAP    bool `json:"mayImap"`
	MayPOP3    bool `json:"mayPop3"`
	MaySieve   bool `json:"maySieve"`
}

func toEnabledServicesResponse(m *db.Mailbox) enabledServicesResponse {
	return enabledServicesResponse{
		MaySend:    m.MaySend,
		MayReceive: m.MayReceive,
		MayIMAP:    m.MayIMAP,
		MayPOP3:    m.MayPOP3,
		MaySieve:   m.MaySieve,
	}
}

func (a *App) GetMailboxServices(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toEnabledServicesResponse(mailbox))
}

func (a *App) UpdateMailboxServices(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req enabledServicesResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var disabled []string
	if !req.MaySend {
		disabled = append(disabled, stalwart.PermissionEmailSend)
	}
	if !req.MayReceive {
		disabled = append(disabled, stalwart.PermissionEmailReceive)
	}
	if !req.MayIMAP {
		disabled = append(disabled, stalwart.PermissionIMAPAuthenticate)
	}
	if !req.MayPOP3 {
		disabled = append(disabled, stalwart.PermissionPOP3Authenticate)
	}
	if !req.MaySieve {
		disabled = append(disabled, stalwart.PermissionSieveAuthenticate)
	}

	if err := a.Stalwart.SetMailboxDisabledPermissions(r.Context(), mailbox.LocalPart, domain.Name, disabled); err != nil {
		writeError(w, http.StatusBadGateway, "failed to update services in mail cluster: "+err.Error())
		return
	}
	if err := a.Store.UpdateMailboxServices(r.Context(), mailbox.ID, req.MaySend, req.MayReceive, req.MayIMAP, req.MayPOP3, req.MaySieve); err != nil {
		writeError(w, http.StatusInternalServerError, "services updated in mail cluster but could not update records")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.services_updated", "Updated enabled services for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, req)
}

// --- Password ---

type setMailboxPasswordRequest struct {
	Password string `json:"password"`
}

func (a *App) SetMailboxPassword(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req setMailboxPasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	if err := a.Stalwart.SetMailboxPassword(r.Context(), mailbox.LocalPart, domain.Name, req.Password); err != nil {
		writeError(w, http.StatusBadGateway, "failed to update password in mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.password_changed", "Password changed for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Internal Access ---

type internalAccessResponse struct {
	InternalAccessOnly bool `json:"internalAccessOnly"`
}

func (a *App) GetMailboxInternalAccess(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, internalAccessResponse{InternalAccessOnly: mailbox.InternalAccessOnly})
}

func (a *App) UpdateMailboxInternalAccess(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req internalAccessResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateMailboxInternalAccess(r.Context(), mailbox.ID, req.InternalAccessOnly); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save setting")
		return
	}
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		writeError(w, http.StatusBadGateway, "setting saved but could not update mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.internal_access_updated", "Updated internal access setting for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, req)
}

// --- Delegation ---

type delegationResponse struct {
	Delegation string `json:"delegation"`
}

func (a *App) GetMailboxDelegation(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, delegationResponse{Delegation: mailbox.Delegation})
}

func (a *App) UpdateMailboxDelegation(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req delegationResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateMailboxDelegation(r.Context(), mailbox.ID, req.Delegation); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save delegation")
		return
	}
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		writeError(w, http.StatusBadGateway, "delegation saved but could not update mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.delegation_updated", "Updated delegation for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, req)
}

// --- Forwarding ---

type forwardResponse struct {
	ID          string `json:"id"`
	Destination string `json:"destination"`
}

func toForwardResponse(f db.MailboxForward) forwardResponse {
	return forwardResponse{ID: f.ID, Destination: f.Destination}
}

func (a *App) ListMailboxForwards(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	forwards, err := a.Store.ListMailboxForwards(r.Context(), mailbox.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list forwards")
		return
	}
	out := make([]forwardResponse, len(forwards))
	for i, f := range forwards {
		out[i] = toForwardResponse(f)
	}
	writeJSON(w, http.StatusOK, out)
}

type createForwardRequest struct {
	Destination string `json:"destination"`
}

func (a *App) CreateMailboxForward(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req createForwardRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	destination := strings.ToLower(strings.TrimSpace(req.Destination))
	if !strings.Contains(destination, "@") {
		writeError(w, http.StatusBadRequest, "a valid destination address is required")
		return
	}

	created, err := a.Store.CreateMailboxForward(r.Context(), mailbox.ID, destination)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save forward")
		return
	}
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		a.Store.DeleteMailboxForward(r.Context(), mailbox.ID, created.ID)
		writeError(w, http.StatusBadGateway, "could not deploy forward to mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.forward_created", "Added forward to "+destination+" for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusCreated, toForwardResponse(*created))
}

func (a *App) DeleteMailboxForward(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	forwardID := r.PathValue("forwardId")

	if err := a.Store.DeleteMailboxForward(r.Context(), mailbox.ID, forwardID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "forward not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not delete forward")
		return
	}
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		writeError(w, http.StatusBadGateway, "forward deleted but could not update mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.forward_deleted", "Removed a forward for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Listing Settings ---

type mailboxListingResponse struct {
	Name string `json:"name"`
	Tags string `json:"tags"`
}

func (a *App) GetMailboxListing(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, mailboxListingResponse{Name: mailbox.DisplayName, Tags: mailbox.ListingTags})
}

func (a *App) UpdateMailboxListing(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req mailboxListingResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateMailboxListing(r.Context(), mailbox.ID, req.Name, req.Tags); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save listing settings")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.listing_updated", "Updated listing settings for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, req)
}

// --- Attached Notes ---

type mailboxNotesResponse struct {
	Notes string `json:"notes"`
}

func (a *App) GetMailboxNotes(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, mailboxNotesResponse{Notes: mailbox.Notes})
}

func (a *App) UpdateMailboxNotes(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req mailboxNotesResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateMailboxNotes(r.Context(), mailbox.ID, req.Notes); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save notes")
		return
	}
	writeJSON(w, http.StatusOK, req)
}

// --- Expiration ---

type expirationResponse struct {
	ExpiresAt            *string `json:"expiresAt"`
	RemoveUponExpiration bool    `json:"removeUponExpiration"`
}

func toExpirationResponse(m *db.Mailbox) expirationResponse {
	resp := expirationResponse{RemoveUponExpiration: m.RemoveUponExpiration}
	if m.ExpiresAt.Valid {
		formatted := m.ExpiresAt.Time.Format("2006-01-02")
		resp.ExpiresAt = &formatted
	}
	return resp
}

func (a *App) GetMailboxExpiration(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toExpirationResponse(mailbox))
}

type updateExpirationRequest struct {
	ExpiresAt            *string `json:"expiresAt"`
	RemoveUponExpiration bool    `json:"removeUponExpiration"`
}

func (a *App) UpdateMailboxExpiration(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req updateExpirationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		parsed, err := time.Parse("2006-01-02", *req.ExpiresAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "expiresAt must be an ISO date (YYYY-MM-DD)")
			return
		}
		expiresAt = &parsed
	}

	if err := a.Store.UpdateMailboxExpiration(r.Context(), mailbox.ID, expiresAt, req.RemoveUponExpiration); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save expiration")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.expiration_updated", "Updated expiration for "+mailbox.LocalPart+"@"+domain.Name)

	updated, err := a.Store.GetMailbox(r.Context(), mailbox.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "expiration saved but could not reload")
		return
	}
	writeJSON(w, http.StatusOK, toExpirationResponse(updated))
}

// --- Limits (Stalwart's real absolute quotas, not Migadu's daily-resetting
// counters - see internal/stalwart/mailbox_settings.go SetMailboxQuotas) ---

type limitsResponse struct {
	MaxEmails         int64 `json:"maxEmails"`
	MaxDiskQuotaBytes int64 `json:"maxDiskQuotaBytes"`
}

func (a *App) GetMailboxLimits(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, limitsResponse{MaxEmails: mailbox.MaxEmails, MaxDiskQuotaBytes: mailbox.MaxDiskQuotaBytes})
}

func (a *App) UpdateMailboxLimits(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req limitsResponse
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MaxEmails < 0 || req.MaxDiskQuotaBytes < 0 {
		writeError(w, http.StatusBadRequest, "limits cannot be negative")
		return
	}

	if err := a.Stalwart.SetMailboxQuotas(r.Context(), mailbox.LocalPart, domain.Name, req.MaxEmails, req.MaxDiskQuotaBytes); err != nil {
		writeError(w, http.StatusBadGateway, "failed to update limits in mail cluster: "+err.Error())
		return
	}
	if err := a.Store.UpdateMailboxLimits(r.Context(), mailbox.ID, req.MaxEmails, req.MaxDiskQuotaBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "limits updated in mail cluster but could not update records")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.limits_updated", "Updated limits for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, req)
}

// --- Identities ---

type identityResponse struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

func (a *App) ListMailboxIdentities(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	identities, err := a.Stalwart.ListIdentities(r.Context(), mailbox.LocalPart, domain.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not load identities from mail cluster: "+err.Error())
		return
	}
	out := make([]identityResponse, len(identities))
	for i, id := range identities {
		out[i] = identityResponse{ID: id.ID, Name: id.Name, Email: id.Email}
	}
	writeJSON(w, http.StatusOK, out)
}

type createIdentityRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

func (a *App) CreateMailboxIdentity(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req createIdentityRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(email, "@") {
		writeError(w, http.StatusBadRequest, "a valid email address is required")
		return
	}

	identity, err := a.Stalwart.CreateIdentity(r.Context(), mailbox.LocalPart, domain.Name, strings.TrimSpace(req.Name), email)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not create identity in mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.identity_created", "Added identity "+email+" for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusCreated, identityResponse{ID: identity.ID, Name: identity.Name, Email: identity.Email})
}

func (a *App) DeleteMailboxIdentity(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	identityID := r.PathValue("identityId")

	if err := a.Stalwart.DeleteIdentity(r.Context(), mailbox.LocalPart, domain.Name, identityID); err != nil {
		writeError(w, http.StatusBadGateway, "could not delete identity in mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.identity_deleted", "Removed an identity for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Recent Logs ---

type recentLogsResponse struct {
	Incoming []stalwart.RecentEmail `json:"incoming"`
	Outgoing []stalwart.RecentEmail `json:"outgoing"`
}

// --- Recent Activity (mailbox-scoped) ---

func (a *App) GetMailboxActivity(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	address := mailbox.LocalPart + "@" + domain.Name
	entries, err := a.Store.ListActivityForAddress(r.Context(), domain.ID, address, 50)
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

func (a *App) GetMailboxRecentLogs(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	incoming, err := a.Stalwart.ListRecentEmails(r.Context(), mailbox.LocalPart, domain.Name, "inbox", 20)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not load incoming messages: "+err.Error())
		return
	}
	outgoing, err := a.Stalwart.ListRecentEmails(r.Context(), mailbox.LocalPart, domain.Name, "sent", 20)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not load outgoing messages: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, recentLogsResponse{Incoming: incoming, Outgoing: outgoing})
}
