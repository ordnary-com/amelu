package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
)

const passwordResetTokenTTL = 24 * time.Hour

// InviteMailboxPassword emails a one-time, time-limited link to an address
// the admin provides (a recovery address the mailbox owner can actually
// read - the mailbox itself has no password yet, so it can't receive its
// own invite). The recipient sets their own password without the admin
// ever seeing or choosing it.
func (a *App) InviteMailboxPassword(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageMailboxes(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage mailboxes")
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	if a.Resend == nil {
		writeError(w, http.StatusServiceUnavailable, "password reset emails aren't configured on this server")
		return
	}

	var req struct {
		Email string `json:"email"`
	}
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
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"mailbox.password_reset", "mailbox", mailbox.ID, mailbox.LocalPart+"@"+domain.Name, nil, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// sendMailboxPasswordInvite is the shared core of InviteMailboxPassword
// (customer-facing) and AdminResetMailboxPassword (Helm admin surface) -
// generates a one-time token and emails the setup link, never handling a
// plaintext password itself.
func (a *App) sendMailboxPasswordInvite(r *http.Request, mailbox *db.Mailbox, domain *db.Domain, recipient string) error {
	rawToken, tokenHash, err := auth.NewSessionToken()
	if err != nil {
		return errors.New("could not generate reset token")
	}
	expiresAt := time.Now().Add(passwordResetTokenTTL)
	if err := a.Store.CreatePasswordResetToken(r.Context(), mailbox.ID, tokenHash, expiresAt); err != nil {
		return errors.New("could not save reset token")
	}

	address := mailbox.LocalPart + "@" + domain.Name
	link := a.FrontendOrigin + "/reset-password/" + rawToken
	subject := "Set up your password for " + address
	html := `<p>You've been invited to set up the password for the mailbox <strong>` + address + `</strong>.</p>` +
		`<p><a href="` + link + `">Click here to set your password</a></p>` +
		`<p>This link expires in 24 hours and can only be used once.</p>` +
		`<p>If you weren't expecting this, you can safely ignore this email.</p>`
	text := "You've been invited to set up the password for the mailbox " + address + ".\n\n" +
		"Set your password here: " + link + "\n\n" +
		"This link expires in 24 hours and can only be used once.\n\n" +
		"If you weren't expecting this, you can safely ignore this email."

	if _, err := a.Resend.SendEmail(r.Context(), recipient, subject, html, text); err != nil {
		return errors.New("could not send invite email: " + err.Error())
	}

	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.password_invite_sent", "Sent password setup invite for "+address+" to "+recipient)
	return nil
}

// GetPasswordResetToken is a public (unauthenticated) endpoint - the
// recipient isn't logged into Amelu, they just clicked an emailed link.
// Reports the same generic "invalid or expired" result whether the token
// never existed, was already used, or expired, to avoid letting a caller
// distinguish those cases.
func (a *App) GetPasswordResetToken(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	tokenHash := auth.HashToken(token)

	rec, err := a.Store.GetValidPasswordResetToken(r.Context(), tokenHash)
	if errors.Is(err, db.ErrNotFound) {
		writeJSON(w, http.StatusOK, map[string]bool{"valid": false})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check reset link")
		return
	}

	mailbox, err := a.Store.GetMailbox(r.Context(), rec.MailboxID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"valid": false})
		return
	}
	domain, err := a.Store.GetDomainByID(r.Context(), mailbox.DomainID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"valid": false})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"valid":   true,
		"address": mailbox.LocalPart + "@" + domain.Name,
	})
}

// CompletePasswordReset is also public - same generic-error rule as
// GetPasswordResetToken above.
func (a *App) CompletePasswordReset(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	tokenHash := auth.HashToken(token)

	rec, err := a.Store.GetValidPasswordResetToken(r.Context(), tokenHash)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "this link is invalid or has expired")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check reset link")
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	mailbox, err := a.Store.GetMailbox(r.Context(), rec.MailboxID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load mailbox")
		return
	}
	domain, err := a.Store.GetDomainByID(r.Context(), mailbox.DomainID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	if err := a.Stalwart.SetMailboxPassword(r.Context(), mailbox.LocalPart, domain.Name, req.Password); err != nil {
		writeError(w, http.StatusBadGateway, "failed to set password in mail cluster: "+err.Error())
		return
	}
	if err := a.Store.MarkPasswordResetTokenUsed(r.Context(), rec.ID); err != nil {
		// The password is already set at this point - log but don't fail
		// the request over a bookkeeping error the user can't act on.
		a.Store.LogActivity(r.Context(), domain.ID, "mailbox.password_reset_mark_used_failed", "Could not mark reset token used for "+mailbox.LocalPart+"@"+domain.Name+": "+err.Error())
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.password_reset_completed", "Password set via invite link for "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
