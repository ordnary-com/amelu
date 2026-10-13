package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"slices"
	"strings"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
	"amelu/backend/internal/ordnaryauth"
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
	origin := a.FrontendOrigin
	if o := r.URL.Query().Get("origin"); o != "" {
		if !slices.Contains(a.FrontendOrigins, o) {
			writeError(w, http.StatusBadRequest, "unknown origin")
			return
		}
		origin = o
	}
	a.Ordnary.Login(w, r, origin, r.URL.Query().Get("switch") == "1")
}

// loginOrigin is the dashboard to send the browser back to after the Ordnary
// round trip: the one that started it, when that's still an allowed origin.
func (a *App) loginOrigin(result *ordnaryauth.CallbackResult) string {
	if result != nil && slices.Contains(a.FrontendOrigins, result.Origin) {
		return result.Origin
	}
	return a.FrontendOrigin
}

// safeReturnTo keeps returnTo a path on the dashboard: "//evil.example" or
// "@evil.example" appended to the origin would leave the site.
func safeReturnTo(returnTo string) string {
	if !strings.HasPrefix(returnTo, "/") || strings.HasPrefix(returnTo, "//") || strings.HasPrefix(returnTo, "/\\") {
		return "/domains"
	}
	return returnTo
}

// OrdnaryCallback exchanges the code, finds or provisions the matching
// Amelu customer by Ordnary user id (falling back to email for accounts
// not linked yet), and starts a normal Amelu session - identical to
// what Login/Signup do, just sourced from Ordnary identity instead of a
// password form.
func (a *App) OrdnaryCallback(w http.ResponseWriter, r *http.Request) {
	if a.Ordnary == nil {
		writeError(w, http.StatusServiceUnavailable, "login with Ordnary account is not configured")
		return
	}

	result, err := a.Ordnary.Callback(w, r)
	if err != nil {
		// The redirect only says that it failed; the reason (state mismatch,
		// a refused code exchange, userinfo) is only ever visible here.
		log.Printf("ordnary auth: callback: %v", err)
		http.Redirect(w, r, a.loginOrigin(result)+"/login?error=ordnary_auth_failed", http.StatusFound)
		return
	}
	if !result.User.EmailVerified {
		http.Redirect(w, r, a.loginOrigin(result)+"/login?error=ordnary_email_unverified", http.StatusFound)
		return
	}
	email := strings.ToLower(strings.TrimSpace(result.User.Email))

	customer, err := a.findOrProvisionOrdnaryCustomer(r, result.User.ID, email, result.User.Name)
	if errors.Is(err, errOrdnaryAccountMismatch) {
		log.Printf("ordnary auth: %s is already linked to another Ordnary user, refusing %s", email, result.User.ID)
		http.Redirect(w, r, a.loginOrigin(result)+"/login?error=ordnary_account_mismatch", http.StatusFound)
		return
	}
	if err != nil {
		log.Printf("ordnary auth: find or create customer: %v", err)
		writeError(w, http.StatusInternalServerError, "could not sign in")
		return
	}

	a.Store.UpdateCustomerLastSignIn(r.Context(), customer.ID)
	if err := a.Store.UpdateCustomerAvatarURL(r.Context(), customer.ID, result.User.Picture); err != nil {
		log.Printf("ordnary auth: store avatar for %s: %v", customer.ID, err)
	}
	// Name is managed in Ordnary only (Amelu has no form for it any more), so
	// every sign-in copies it over; an Ordnary account without a name keeps
	// whatever Amelu already had.
	if name := strings.TrimSpace(result.User.Name); name != "" && name != customer.Name {
		if err := a.Store.UpdateCustomerName(r.Context(), customer.ID, name); err != nil {
			log.Printf("ordnary auth: store name for %s: %v", customer.ID, err)
		}
	}
	a.startSession(w, r, customer.ID)

	http.Redirect(w, r, a.loginOrigin(result)+safeReturnTo(result.ReturnTo), http.StatusFound)
}

var errOrdnaryAccountMismatch = errors.New("customer is linked to a different Ordnary user")

// findOrProvisionOrdnaryCustomer resolves the customer by Ordnary's stable
// user id first, so an email change in Ordnary keeps the same Amelu account
// (and the new email is copied over). Customers from before that id was
// stored are matched by email once and linked on the spot.
func (a *App) findOrProvisionOrdnaryCustomer(r *http.Request, subject, email, name string) (*db.Customer, error) {
	ctx := r.Context()

	customer, err := a.Store.GetCustomerByOrdnarySubject(ctx, subject)
	if err == nil {
		changed, err := a.Store.SyncCustomerEmail(ctx, customer.ID, email)
		if err != nil {
			return nil, err
		}
		if changed {
			customer.Email = email
		} else if customer.Email != email {
			log.Printf("ordnary auth: customer %s now has email %s in Ordnary, but another customer holds it; keeping %s", customer.ID, email, customer.Email)
		}
		return customer, nil
	}
	if !errors.Is(err, db.ErrNotFound) {
		return nil, err
	}

	customer, err = a.Store.GetCustomerByEmail(ctx, email)
	if errors.Is(err, db.ErrNotFound) {
		customer, err = a.provisionOrdnaryCustomer(r, email, name)
	}
	if err != nil {
		return nil, err
	}
	if err := a.Store.LinkCustomerOrdnarySubject(ctx, customer.ID, subject); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, errOrdnaryAccountMismatch
		}
		return nil, err
	}
	return customer, nil
}

// provisionOrdnaryCustomer auto-creates an organization and customer for a
// first-time Ordnary login, matching Signup's shape. There's no password to
// set, so it gets a random, never-shown, never-usable hash - CheckPassword
// will simply never match it, which is fine since this account can only ever
// sign in via Ordnary.
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
