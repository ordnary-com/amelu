package handlers

import (
	"errors"
	"net/http"
	"strings"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
)

type updateNameRequest struct {
	Name string `json:"name"`
}

func (a *App) UpdateAccountName(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req updateNameRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	if err := a.Store.UpdateCustomerName(r.Context(), customer.ID, req.Name); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update name")
		return
	}

	profile, ok := a.loadProfile(w, r, customer.ID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toProfileResponse(profile))
}

type updateProfileRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Username  string `json:"username"`
}

func (a *App) UpdateAccountProfile(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req updateProfileRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	req.Username = strings.TrimSpace(req.Username)
	if req.FirstName == "" || req.LastName == "" {
		writeError(w, http.StatusBadRequest, "first and last name are required")
		return
	}
	if req.Username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}

	if existing, err := a.Store.GetCustomerByUsername(r.Context(), req.Username); err == nil && existing.ID != customer.ID {
		writeError(w, http.StatusConflict, "this username is already taken")
		return
	} else if err != nil && !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not check existing accounts")
		return
	}

	if err := a.Store.UpdateCustomerProfileFields(r.Context(), customer.ID, req.FirstName, req.LastName, req.Username); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update profile")
		return
	}

	profile, ok := a.loadProfile(w, r, customer.ID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toProfileResponse(profile))
}

type updateEmailRequest struct {
	Email           string `json:"email"`
	CurrentPassword string `json:"currentPassword"`
}

func (a *App) UpdateAccountEmail(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req updateEmailRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if !auth.CheckPassword(customer.PasswordHash, req.CurrentPassword) {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	if existing, err := a.Store.GetCustomerByEmail(r.Context(), req.Email); err == nil && existing.ID != customer.ID {
		writeError(w, http.StatusConflict, "an account with this email already exists")
		return
	} else if err != nil && !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not check existing accounts")
		return
	}

	if err := a.Store.UpdateCustomerEmail(r.Context(), customer.ID, req.Email); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update email")
		return
	}

	profile, ok := a.loadProfile(w, r, customer.ID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toProfileResponse(profile))
}

type updatePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (a *App) UpdateAccountPassword(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req updatePasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !auth.CheckPassword(customer.PasswordHash, req.CurrentPassword) {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}
	if len(req.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "new password must be at least 8 characters")
		return
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update password")
		return
	}
	if err := a.Store.UpdateCustomerPassword(r.Context(), customer.ID, hash); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update password")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type terminateAccountRequest struct {
	CurrentPassword string `json:"currentPassword"`
}

// TerminateAccount permanently deletes the customer's account: every domain
// and mailbox is torn down in Stalwart first (same cascade as DeleteDomain),
// then the customer row is deleted, which cascades to their domains/
// mailboxes/sessions in our own DB via foreign keys.
func (a *App) TerminateAccount(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req terminateAccountRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !auth.CheckPassword(customer.PasswordHash, req.CurrentPassword) {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	// Deleting the account also destroys every domain it personally
	// created in Stalwart (below) - safe only when this customer is the
	// organization's sole member. With teammates present, self-termination
	// must go through team removal instead (see RemoveMember), which
	// reassigns domains to another owner rather than destroying them.
	if customer.OrganizationID.Valid {
		members, err := a.Store.ListOrganizationMembers(r.Context(), customer.OrganizationID.String)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not check organization membership")
			return
		}
		if len(members) > 1 {
			writeError(w, http.StatusConflict, "you're part of a team - have another owner or admin remove you, or transfer ownership, before deleting your account")
			return
		}
	}

	domains, err := a.Store.ListDomains(r.Context(), customer.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list domains")
		return
	}
	for i := range domains {
		if err := a.destroyDomainInStalwart(r.Context(), &domains[i]); err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
	}

	if err := a.Store.DeleteCustomer(r.Context(), customer.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete account")
		return
	}

	auth.ClearSessionCookie(w, a.CookieSecure)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
