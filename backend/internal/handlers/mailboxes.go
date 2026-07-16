package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/csv"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

type mailboxResponse struct {
	ID          string `json:"id"`
	DomainID    string `json:"domainId"`
	Address     string `json:"address"`
	LocalPart   string `json:"localPart"`
	DisplayName string `json:"displayName"`
	Status      string `json:"status"`
	CreatedAt   string `json:"createdAt"`
}

func toMailboxResponse(m *db.Mailbox, domainName string) mailboxResponse {
	return mailboxResponse{
		ID:          m.ID,
		DomainID:    m.DomainID,
		Address:     m.LocalPart + "@" + domainName,
		LocalPart:   m.LocalPart,
		DisplayName: m.DisplayName,
		Status:      m.Status,
		CreatedAt:   m.CreatedAt.Format(http.TimeFormat),
	}
}

// httpError carries the intended HTTP status alongside the message, so
// createMailbox (shared by the single-create handler and CSV import) can
// report the right status without every caller re-deriving it.
type httpError struct {
	status  int
	message string
}

func (e *httpError) Error() string { return e.message }

func errStatus(err error) int {
	var he *httpError
	if errors.As(err, &he) {
		return he.status
	}
	return http.StatusInternalServerError
}

// createMailbox creates one mailbox end to end (plan limit check, Stalwart,
// then our own DB), shared by the single-mailbox create handler and CSV
// import so the rules can't drift between the two paths.
func (a *App) createMailbox(ctx context.Context, planTierID string, domain *db.Domain, rawLocalPart, displayName, password string) (*db.Mailbox, string, error) {
	localPart := strings.ToLower(strings.TrimSpace(rawLocalPart))
	if localPart == "" {
		return nil, "", &httpError{http.StatusBadRequest, "localPart is required"}
	}

	_, maxMailboxesPerDomain, err := a.Store.GetPlanTier(ctx, planTierID)
	if err != nil {
		return nil, "", &httpError{http.StatusInternalServerError, "could not check plan limits"}
	}
	mailboxCount, err := a.Store.CountMailboxes(ctx, domain.ID)
	if err != nil {
		return nil, "", &httpError{http.StatusInternalServerError, "could not check plan limits"}
	}
	if mailboxCount >= maxMailboxesPerDomain {
		return nil, "", &httpError{http.StatusForbidden, "mailbox limit reached for your plan"}
	}

	generatedPassword := ""
	if password == "" {
		generatedPassword, err = generatePassword()
		if err != nil {
			return nil, "", &httpError{http.StatusInternalServerError, "could not generate password"}
		}
		password = generatedPassword
	}

	if _, err := a.Stalwart.CreateMailbox(ctx, localPart, domain.Name, password); err != nil {
		return nil, "", &httpError{http.StatusBadGateway, "failed to create mailbox " + localPart + " in mail cluster: " + err.Error()}
	}

	mailbox, err := a.Store.CreateMailbox(ctx, domain.ID, localPart, displayName)
	if err != nil {
		return nil, "", &httpError{http.StatusConflict, "mailbox " + localPart + " already exists or could not be recorded"}
	}

	// Best-effort, same as deployDomainWideRulesToMailbox below - a hiccup
	// here shouldn't block mailbox creation, it just means this one mailbox
	// keeps Stalwart's out-of-the-box services/limits until edited by hand.
	if err := a.applyDomainDefaultsToMailbox(ctx, domain, mailbox); err != nil {
		a.Store.LogActivity(ctx, domain.ID, "mailbox.defaults_apply_failed", "Could not apply domain default services/limits to "+localPart+"@"+domain.Name+": "+err.Error())
	}

	return mailbox, generatedPassword, nil
}

// applyDomainDefaultsToMailbox pushes the domain's Default Services /
// Default Limits template onto a just-created mailbox. Only mailboxes
// created from this point on are affected - existing mailboxes are
// untouched, matching what both settings pages tell the customer.
func (a *App) applyDomainDefaultsToMailbox(ctx context.Context, domain *db.Domain, mailbox *db.Mailbox) error {
	var disabled []string
	if !domain.DefaultMaySend {
		disabled = append(disabled, stalwart.PermissionEmailSend)
	}
	if !domain.DefaultMayReceive {
		disabled = append(disabled, stalwart.PermissionEmailReceive)
	}
	if !domain.DefaultMayIMAP {
		disabled = append(disabled, stalwart.PermissionIMAPAuthenticate)
	}
	if !domain.DefaultMayPOP3 {
		disabled = append(disabled, stalwart.PermissionPOP3Authenticate)
	}
	if !domain.DefaultMaySieve {
		disabled = append(disabled, stalwart.PermissionSieveAuthenticate)
	}
	if len(disabled) > 0 {
		if err := a.Stalwart.SetMailboxDisabledPermissions(ctx, mailbox.LocalPart, domain.Name, disabled); err != nil {
			return fmt.Errorf("apply default services: %w", err)
		}
		if err := a.Store.UpdateMailboxServices(ctx, mailbox.ID, domain.DefaultMaySend, domain.DefaultMayReceive, domain.DefaultMayIMAP, domain.DefaultMayPOP3, domain.DefaultMaySieve); err != nil {
			return fmt.Errorf("record default services: %w", err)
		}
	}

	if domain.DefaultMaxEmails != 0 || domain.DefaultMaxDiskQuota != 0 {
		if err := a.Stalwart.SetMailboxQuotas(ctx, mailbox.LocalPart, domain.Name, domain.DefaultMaxEmails, domain.DefaultMaxDiskQuota); err != nil {
			return fmt.Errorf("apply default limits: %w", err)
		}
		if err := a.Store.UpdateMailboxLimits(ctx, mailbox.ID, domain.DefaultMaxEmails, domain.DefaultMaxDiskQuota); err != nil {
			return fmt.Errorf("record default limits: %w", err)
		}
	}
	return nil
}

type createMailboxRequest struct {
	LocalPart   string `json:"localPart"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

type createMailboxResponse struct {
	mailboxResponse
	GeneratedPassword string `json:"generatedPassword,omitempty"`
}

func (a *App) CreateMailbox(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageMailboxes(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage mailboxes")
		return
	}
	domainID := r.PathValue("domainId")

	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, domainID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	var req createMailboxRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	planTierID, err := a.Store.GetOrganizationPlanTierID(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check plan limits")
		return
	}
	mailbox, generatedPassword, err := a.createMailbox(r.Context(), planTierID, domain, req.LocalPart, req.DisplayName, req.Password)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.created", "Mailbox "+mailbox.LocalPart+"@"+domain.Name+" created")
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"mailbox.created", "mailbox", mailbox.ID, mailbox.LocalPart+"@"+domain.Name, nil, requestIP(r))

	// Best-effort: existing domain-wide rules (Bcc Captures, Sender/Recipient
	// Denylist, Sender Junklist, Subject Handling) should cover this mailbox
	// immediately, but a hiccup here shouldn't block mailbox creation - the
	// next rule change will redeploy to every mailbox anyway.
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		a.Store.LogActivity(r.Context(), domain.ID, "spam_rules.deploy_failed", "Could not apply existing spam/capture rules to "+mailbox.LocalPart+"@"+domain.Name+": "+err.Error())
	}

	writeJSON(w, http.StatusCreated, createMailboxResponse{
		mailboxResponse:   toMailboxResponse(mailbox, domain.Name),
		GeneratedPassword: generatedPassword,
	})
}

func (a *App) ListMailboxes(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domainID := r.PathValue("domainId")

	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, domainID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	mailboxes, err := a.Store.ListMailboxes(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list mailboxes")
		return
	}

	out := make([]mailboxResponse, 0, len(mailboxes))
	for i := range mailboxes {
		out = append(out, toMailboxResponse(&mailboxes[i], domain.Name))
	}
	writeJSON(w, http.StatusOK, out)
}

// GetMailbox backs the per-mailbox Manage page.
func (a *App) GetMailbox(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailboxID := r.PathValue("id")

	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, mailboxID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toMailboxResponse(mailbox, domain.Name))
}

type updateMailboxNameRequest struct {
	DisplayName string `json:"displayName"`
}

func (a *App) UpdateMailboxName(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageMailboxes(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage mailboxes")
		return
	}
	mailboxID := r.PathValue("id")

	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, mailboxID)
	if !ok {
		return
	}

	var req updateMailboxNameRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := a.Store.UpdateMailboxDisplayName(r.Context(), mailbox.ID, req.DisplayName); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update name")
		return
	}
	mailbox.DisplayName = req.DisplayName
	writeJSON(w, http.StatusOK, toMailboxResponse(mailbox, domain.Name))
}

func (a *App) DeleteMailbox(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageMailboxes(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage mailboxes")
		return
	}
	mailboxID := r.PathValue("id")

	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, mailboxID)
	if !ok {
		return
	}

	// If it's already gone from Stalwart (e.g. removed out-of-band), that's
	// fine - just clean up our own record of it.
	if err := a.Stalwart.DeleteMailbox(r.Context(), mailbox.LocalPart, domain.Name); err != nil && !errors.Is(err, stalwart.ErrNotFound) {
		writeError(w, http.StatusBadGateway, "failed to delete mailbox in mail cluster: "+err.Error())
		return
	}

	if err := a.Store.DeleteMailbox(r.Context(), mailbox.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "mailbox removed from mail cluster but could not update records")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.deleted", "Mailbox "+mailbox.LocalPart+"@"+domain.Name+" deleted")
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"mailbox.deleted", "mailbox", mailbox.ID, mailbox.LocalPart+"@"+domain.Name, nil, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) SuspendMailbox(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageMailboxes(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage mailboxes")
		return
	}
	mailboxID := r.PathValue("id")

	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, mailboxID)
	if !ok {
		return
	}

	if err := a.Stalwart.SuspendMailbox(r.Context(), mailbox.LocalPart, domain.Name); err != nil {
		writeError(w, http.StatusBadGateway, "failed to suspend mailbox in mail cluster: "+err.Error())
		return
	}

	if err := a.Store.UpdateMailboxStatus(r.Context(), mailbox.ID, "suspended"); err != nil {
		writeError(w, http.StatusInternalServerError, "mailbox suspended in mail cluster but could not update records")
		return
	}
	mailbox.Status = "suspended"
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.suspended", "Mailbox "+mailbox.LocalPart+"@"+domain.Name+" suspended")
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"mailbox.suspended", "mailbox", mailbox.ID, mailbox.LocalPart+"@"+domain.Name, nil, requestIP(r))
	writeJSON(w, http.StatusOK, toMailboxResponse(mailbox, domain.Name))
}

// ActivateMailbox reverses SuspendMailbox.
func (a *App) ActivateMailbox(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageMailboxes(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage mailboxes")
		return
	}
	mailboxID := r.PathValue("id")

	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, mailboxID)
	if !ok {
		return
	}

	if err := a.Stalwart.ActivateMailbox(r.Context(), mailbox.LocalPart, domain.Name); err != nil {
		writeError(w, http.StatusBadGateway, "failed to activate mailbox in mail cluster: "+err.Error())
		return
	}

	if err := a.Store.UpdateMailboxStatus(r.Context(), mailbox.ID, "active"); err != nil {
		writeError(w, http.StatusInternalServerError, "mailbox activated in mail cluster but could not update records")
		return
	}
	mailbox.Status = "active"
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.activated", "Mailbox "+mailbox.LocalPart+"@"+domain.Name+" activated")
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"mailbox.activated", "mailbox", mailbox.ID, mailbox.LocalPart+"@"+domain.Name, nil, requestIP(r))
	writeJSON(w, http.StatusOK, toMailboxResponse(mailbox, domain.Name))
}

// ExportMailboxesCSV downloads every mailbox for a domain as CSV in the
// same 7-column, no-header order ImportMailboxesCSV expects (Name, Address,
// Password, InviteEmail, ForwardEmail, ExpirationDate,
// RemoveUponExpiration), so export -> re-import round-trips cleanly.
// Password is always blank on export (we never have the plaintext to give
// back) - re-importing an exported row generates a fresh password, same as
// leaving Password blank on a new row. Only the first forward is exported
// per mailbox - ForwardEmail is a single column, matching what import
// accepts.
func (a *App) ExportMailboxesCSV(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
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

	mailboxes, err := a.Store.ListMailboxes(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list mailboxes")
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-mailboxes.csv"`, domain.Name))

	cw := csv.NewWriter(w)
	for _, m := range mailboxes {
		forwardEmail := ""
		if forwards, err := a.Store.ListMailboxForwards(r.Context(), m.ID); err == nil && len(forwards) > 0 {
			forwardEmail = forwards[0].Destination
		}
		expirationDate := ""
		if m.ExpiresAt.Valid {
			expirationDate = m.ExpiresAt.Time.Format("2006-01-02")
		}
		removeUponExpiration := ""
		if m.RemoveUponExpiration {
			removeUponExpiration = "true"
		}
		cw.Write([]string{m.DisplayName, m.LocalPart + "@" + domain.Name, "", "", forwardEmail, expirationDate, removeUponExpiration})
	}
	cw.Flush()
}

type importMailboxesRequest struct {
	CSV string `json:"csv"`
}

type importMailboxResult struct {
	Address           string `json:"address"`
	GeneratedPassword string `json:"generatedPassword,omitempty"`
	Note              string `json:"note,omitempty"`
	Error             string `json:"error,omitempty"`
}

// ImportMailboxesCSV bulk-creates mailboxes from CSV with exactly 7 columns
// and no header row, in this order: Name, Address, Password, InviteEmail,
// ForwardEmail, ExpirationDate, RemoveUponExpiration. InviteEmail falls back
// to a generated password (no invite-by-email path exists in bulk import).
// ForwardEmail/ExpirationDate/RemoveUponExpiration are applied via the same
// store calls and sieve redeploy the dedicated Forwarding/Expiration pages
// use; a row's forward or expiration failing to apply doesn't undo the
// mailbox creation, it's reported as a note on that row instead.
//
// Each row is created independently - one failure (limit reached,
// duplicate) doesn't abort the rest, and every row's outcome (including
// one-time generated passwords) comes back so the customer can see exactly
// what happened.
func (a *App) ImportMailboxesCSV(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageMailboxes(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage mailboxes")
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

	planTierID, err := a.Store.GetOrganizationPlanTierID(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check plan limits")
		return
	}

	var req importMailboxesRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cr := csv.NewReader(strings.NewReader(req.CSV))
	cr.FieldsPerRecord = -1
	rows, err := cr.ReadAll()
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not parse CSV: "+err.Error())
		return
	}

	col := func(row []string, i int) string {
		if i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	var results []importMailboxResult
	for _, row := range rows {
		address := col(row, 1)
		if address == "" {
			continue
		}
		displayName := col(row, 0)
		localPart := strings.TrimSuffix(address, "@"+domain.Name)
		password := col(row, 2)
		forwardEmail := col(row, 4)
		expirationDate := col(row, 5)
		removeUponExpiration := col(row, 6)

		mailbox, generatedPassword, err := a.createMailbox(r.Context(), planTierID, domain, localPart, displayName, password)
		if err != nil {
			results = append(results, importMailboxResult{Address: localPart + "@" + domain.Name, Error: err.Error()})
			continue
		}

		var problems []string
		removeUpon := strings.EqualFold(removeUponExpiration, "true") || removeUponExpiration == "1"

		if expirationDate != "" || removeUpon {
			var expiresAt *time.Time
			if expirationDate != "" {
				parsed, err := time.Parse("2006-01-02", expirationDate)
				if err != nil {
					problems = append(problems, "ExpirationDate must be YYYY-MM-DD, was ignored")
				} else {
					expiresAt = &parsed
				}
			}
			if len(problems) == 0 {
				if err := a.Store.UpdateMailboxExpiration(r.Context(), mailbox.ID, expiresAt, removeUpon); err != nil {
					problems = append(problems, "could not save expiration")
				}
			}
		}

		if forwardEmail != "" {
			destination := strings.ToLower(strings.TrimSpace(forwardEmail))
			if !strings.Contains(destination, "@") {
				problems = append(problems, "ForwardEmail must be a valid address, was ignored")
			} else if _, err := a.Store.CreateMailboxForward(r.Context(), mailbox.ID, destination); err != nil {
				problems = append(problems, "could not save forward")
			} else if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
				problems = append(problems, "forward saved but could not deploy to mail cluster")
			}
		}

		note := ""
		if len(problems) > 0 {
			note = strings.Join(problems, "; ")
		}

		results = append(results, importMailboxResult{
			Address:           mailbox.LocalPart + "@" + domain.Name,
			GeneratedPassword: generatedPassword,
			Note:              note,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

// loadOwnedMailbox loads a mailbox and its parent domain, verifying the
// domain belongs to organizationID. Writes an error response and returns
// ok=false if not found or not owned.
func (a *App) loadOwnedMailbox(w http.ResponseWriter, r *http.Request, organizationID, mailboxID string) (*db.Mailbox, *db.Domain, bool) {
	mailbox, err := a.Store.GetMailbox(r.Context(), mailboxID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "mailbox not found")
		return nil, nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load mailbox")
		return nil, nil, false
	}

	domain, err := a.Store.GetDomainForOrganization(r.Context(), organizationID, mailbox.DomainID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "mailbox not found")
		return nil, nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return nil, nil, false
	}

	return mailbox, domain, true
}

func generatePassword() (string, error) {
	b := make([]byte, 18)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
