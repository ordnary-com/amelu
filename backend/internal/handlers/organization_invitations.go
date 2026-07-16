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

const invitationTokenTTL = 7 * 24 * time.Hour

type invitationResponse struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	CreatedAt string `json:"createdAt"`
	ExpiresAt string `json:"expiresAt"`
	Expired   bool   `json:"expired"`
}

func toInvitationResponse(inv *db.OrganizationInvitation) invitationResponse {
	return invitationResponse{
		ID:        inv.ID,
		Email:     inv.Email,
		Role:      inv.Role,
		CreatedAt: inv.CreatedAt.Format(http.TimeFormat),
		ExpiresAt: inv.ExpiresAt.Format(http.TimeFormat),
		Expired:   inv.ExpiresAt.Before(time.Now()),
	}
}

// ListOrganizationInvitations backs the "pending invitations" list on
// MyOrganizationPage - owner and admin only, same as CanManageTeam.
func (a *App) ListOrganizationInvitations(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageTeam(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to view invitations")
		return
	}

	invitations, err := a.Store.ListOpenInvitations(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list invitations")
		return
	}

	out := make([]invitationResponse, 0, len(invitations))
	for i := range invitations {
		out = append(out, toInvitationResponse(&invitations[i]))
	}
	writeJSON(w, http.StatusOK, out)
}

type createInvitationRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

type createInvitationResponse struct {
	invitationResponse
	EmailSent    bool   `json:"emailSent"`
	DevInviteURL string `json:"devInviteUrl,omitempty"`
}

// CreateInvitation invites a new teammate by email. Owner and admin only;
// an admin can never invite someone as owner (authz.CanAssignRole). The raw
// token is only ever emailed (via Resend) or, when Resend isn't configured,
// returned in the response as devInviteUrl so local development still
// works end to end - and only outside production (CookieSecure), so a
// misconfigured prod deployment can never leak a working invite link in
// its API response.
func (a *App) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageTeam(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to invite team members")
		return
	}

	var req createInvitationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(email, "@") {
		writeError(w, http.StatusBadRequest, "a valid email address is required")
		return
	}
	if !isValidRole(req.Role) {
		writeError(w, http.StatusBadRequest, "invalid role")
		return
	}
	if !authz.CanAssignRole(role, req.Role) {
		writeError(w, http.StatusForbidden, "you don't have permission to assign this role")
		return
	}

	// Reject invites to an email that's already a member of this same
	// organization - but only within this organization, so we never reveal
	// whether the email has an Amelu account anywhere else.
	if existing, err := a.Store.GetCustomerByEmail(r.Context(), email); err == nil {
		if existing.OrganizationID.Valid && existing.OrganizationID.String == customer.OrganizationID.String {
			writeError(w, http.StatusConflict, "this person is already a member of your organization")
			return
		}
	} else if !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not check existing members")
		return
	}

	rawToken, tokenHash, err := auth.NewSessionToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate invitation token")
		return
	}
	expiresAt := time.Now().Add(invitationTokenTTL)

	inv, err := a.Store.CreateInvitation(r.Context(), customer.OrganizationID.String, email, req.Role, tokenHash, customer.ID, expiresAt)
	if errors.Is(err, db.ErrInvitationExists) {
		writeError(w, http.StatusConflict, "there's already an open invitation for this email")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create invitation")
		return
	}

	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"invitation.created", "invitation", inv.ID, email, map[string]any{"role": req.Role}, requestIP(r))

	link := a.FrontendOrigin + "/accept-invite/" + rawToken
	resp := createInvitationResponse{invitationResponse: toInvitationResponse(inv)}

	if a.Resend != nil {
		orgName := "an organization"
		if org, err := a.Store.GetOrganizationByID(r.Context(), customer.OrganizationID.String); err == nil {
			orgName = org.Name
		}
		subject := "You've been invited to join " + orgName + " on Amelu"
		html := `<p>You've been invited to join an organization on Amelu as <strong>` + req.Role + `</strong>.</p>` +
			`<p><a href="` + link + `">Click here to accept the invitation</a></p>` +
			`<p>This link expires in 7 days and can only be used once.</p>` +
			`<p>If you weren't expecting this, you can safely ignore this email.</p>`
		text := "You've been invited to join an organization on Amelu as " + req.Role + ".\n\n" +
			"Accept your invitation here: " + link + "\n\n" +
			"This link expires in 7 days and can only be used once.\n\n" +
			"If you weren't expecting this, you can safely ignore this email."
		if _, err := a.Resend.SendEmail(r.Context(), email, subject, html, text); err != nil {
			writeError(w, http.StatusBadGateway, "invitation created but could not send email: "+err.Error())
			return
		}
		resp.EmailSent = true
	} else {
		resp.EmailSent = false
		if !a.CookieSecure {
			resp.DevInviteURL = link
		}
	}

	writeJSON(w, http.StatusCreated, resp)
}

// RevokeInvitation cancels a still-open invitation. Owner and admin only.
func (a *App) RevokeInvitation(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageTeam(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage invitations")
		return
	}

	invitationID := r.PathValue("id")
	if err := a.Store.RevokeInvitation(r.Context(), customer.OrganizationID.String, invitationID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "invitation not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not revoke invitation")
		return
	}

	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"invitation.revoked", "invitation", invitationID, "", nil, requestIP(r))

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
