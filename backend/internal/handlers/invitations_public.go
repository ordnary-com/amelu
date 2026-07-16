package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
)

// GetInvitation is the public (unauthenticated) landing lookup for an
// invite link - mirrors GetPasswordResetToken's "same generic result for
// every non-usable case" rule, so a caller can't distinguish an unknown
// token from an expired/revoked/already-accepted one.
func (a *App) GetInvitation(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	tokenHash := auth.HashToken(token)

	inv, err := a.Store.GetInvitationByTokenHash(r.Context(), tokenHash)
	if errors.Is(err, db.ErrNotFound) {
		writeJSON(w, http.StatusOK, map[string]bool{"valid": false})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check invitation")
		return
	}
	if inv.AcceptedAt.Valid || inv.RevokedAt.Valid || inv.ExpiresAt.Before(time.Now()) {
		writeJSON(w, http.StatusOK, map[string]bool{"valid": false})
		return
	}

	org, err := a.Store.GetOrganizationByID(r.Context(), inv.OrganizationID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"valid": false})
		return
	}

	_, err = a.Store.GetCustomerByEmail(r.Context(), inv.Email)
	existingAccount := err == nil

	writeJSON(w, http.StatusOK, map[string]any{
		"valid":            true,
		"email":            inv.Email,
		"role":             inv.Role,
		"organizationName": org.Name,
		"existingAccount":  existingAccount,
	})
}

type acceptInvitationRequest struct {
	Password  string `json:"password"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Username  string `json:"username"`
}

// AcceptInvitation is the public (unauthenticated) accept flow. Amelu has
// no concept of a customer belonging to more than one organization (see
// internal/db/organization_members.go), so this only supports the "brand
// new person" path: if the invited email already has an Amelu account, we
// refuse rather than silently merging or moving them between
// organizations - the message is only ever shown to whoever holds this
// specific valid invitation token (sent to that exact address), not a
// stranger, so it isn't an account-existence leak.
func (a *App) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	tokenHash := auth.HashToken(token)

	inv, err := a.Store.GetInvitationByTokenHash(r.Context(), tokenHash)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "this invitation is invalid or has expired")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load invitation")
		return
	}
	if inv.AcceptedAt.Valid || inv.RevokedAt.Valid || inv.ExpiresAt.Before(time.Now()) {
		writeError(w, http.StatusBadRequest, "this invitation is invalid or has expired")
		return
	}

	if _, err := a.Store.GetCustomerByEmail(r.Context(), inv.Email); err == nil {
		writeError(w, http.StatusConflict, "an Amelu account already exists for this email - log in with that account instead. Amelu doesn't yet support one account belonging to multiple organizations.")
		return
	} else if !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not check existing accounts")
		return
	}

	var req acceptInvitationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	req.Username = strings.TrimSpace(req.Username)
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if req.FirstName == "" || req.LastName == "" {
		writeError(w, http.StatusBadRequest, "first and last name are required")
		return
	}
	if req.Username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}
	if _, err := a.Store.GetCustomerByUsername(r.Context(), req.Username); err == nil {
		writeError(w, http.StatusConflict, "this username is already taken")
		return
	} else if !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not check existing accounts")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}
	name := strings.TrimSpace(req.FirstName + " " + req.LastName)

	customer, err := a.Store.AcceptInvitationForNewCustomer(r.Context(), inv.ID, inv.OrganizationID, inv.Role, inv.Email, name, hash, req.FirstName, req.LastName, req.Username)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusConflict, "this invitation has already been used or is no longer available")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not accept invitation")
		return
	}

	a.Store.LogOrganizationAudit(r.Context(), inv.OrganizationID, &customer.ID, customer.Email,
		"invitation.accepted", "invitation", inv.ID, customer.Email, map[string]any{"role": inv.Role}, requestIP(r))

	profile, ok := a.loadProfile(w, r, customer.ID)
	if !ok {
		return
	}
	a.startSession(w, r, customer.ID)
	writeJSON(w, http.StatusCreated, toProfileResponse(profile))
}
