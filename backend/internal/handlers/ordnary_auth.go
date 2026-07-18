package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
)

// OrdnaryLogin redirects to Ordnary identity's authorize endpoint. See
// internal/ordnaryauth for the OAuth round-trip itself - this file only
// covers turning a successful Ordnary login into an Amelu session, since
// Amelu keeps its own server-side session store (internal/auth) rather than
// adopting Ordnary's own session-cookie model.
func (a *App) OrdnaryLogin(w http.ResponseWriter, r *http.Request) {
	if a.Ordnary == nil {
		writeError(w, http.StatusServiceUnavailable, "login with Ordnary account is not configured")
		return
	}
	a.Ordnary.Login(w, r)
}

// OrdnaryCallback exchanges the code, finds or provisions the matching
// Amelu customer by email, and starts a normal Amelu session - identical to
// what Login/Signup do, just sourced from Ordnary identity instead of a
// password form.
func (a *App) OrdnaryCallback(w http.ResponseWriter, r *http.Request) {
	if a.Ordnary == nil {
		writeError(w, http.StatusServiceUnavailable, "login with Ordnary account is not configured")
		return
	}

	result, err := a.Ordnary.Callback(w, r)
	if err != nil {
		http.Redirect(w, r, a.FrontendOrigin+"/login?error=ordnary_auth_failed", http.StatusFound)
		return
	}
	if !result.User.EmailVerified {
		http.Redirect(w, r, a.FrontendOrigin+"/login?error=ordnary_email_unverified", http.StatusFound)
		return
	}
	email := strings.ToLower(strings.TrimSpace(result.User.Email))

	customer, err := a.Store.GetCustomerByEmail(r.Context(), email)
	if errors.Is(err, db.ErrNotFound) {
		customer, err = a.provisionOrdnaryCustomer(r, email, result.User.Name)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not sign in")
		return
	}

	a.Store.UpdateCustomerLastSignIn(r.Context(), customer.ID)
	a.startSession(w, r, customer.ID)

	returnTo := result.ReturnTo
	if returnTo == "" {
		returnTo = "/domains"
	}
	http.Redirect(w, r, a.FrontendOrigin+returnTo, http.StatusFound)
}

// provisionOrdnaryCustomer auto-creates an organization and customer for a
// first-time Ordnary login, matching Signup's shape. There's no password to
// set, so it gets a random, never-shown, never-usable hash - CheckPassword
// will simply never match it, which is fine since this account can only ever
// sign in via Ordnary until/unless the customer sets a password separately
// (see PATCH /api/account/password).
func (a *App) provisionOrdnaryCustomer(r *http.Request, email, name string) (*db.Customer, error) {
	if name == "" {
		name = email
	}
	organization, err := a.Store.CreateOrganization(r.Context(), fmt.Sprintf("%s's Organization", name))
	if err != nil {
		return nil, err
	}
	unusablePassword, err := auth.HashPassword(randomHex(32))
	if err != nil {
		return nil, err
	}
	customer, err := a.Store.CreateCustomer(r.Context(), email, name, unusablePassword, organization.ID, "", "", "")
	if err != nil {
		return nil, err
	}
	if err := a.Store.AddOrganizationMember(r.Context(), organization.ID, customer.ID, db.RoleOwner); err != nil {
		return nil, err
	}
	return customer, nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
