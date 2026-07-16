package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type signupRequest struct {
	Email            string `json:"email"`
	Name             string `json:"name"`
	Password         string `json:"password"`
	OrganizationName string `json:"organizationName"`
	FirstName        string `json:"firstName"`
	LastName         string `json:"lastName"`
	Username         string `json:"username"`
}

type profileResponse struct {
	ID               string  `json:"id"`
	Email            string  `json:"email"`
	Name             string  `json:"name"`
	FirstName        string  `json:"firstName,omitempty"`
	LastName         string  `json:"lastName,omitempty"`
	Username         string  `json:"username,omitempty"`
	PlanTierID       string  `json:"planTierId"`
	PlanTierName     string  `json:"planTierName"`
	OrganizationID   string  `json:"organizationId"`
	OrganizationName string  `json:"organizationName"`
	Role             string  `json:"role"`
	LastSignInAt     *string `json:"lastSignInAt,omitempty"`
}

func toProfileResponse(p *db.CustomerProfile) profileResponse {
	resp := profileResponse{
		ID:               p.ID,
		Email:            p.Email,
		Name:             p.Name,
		FirstName:        p.FirstName.String,
		LastName:         p.LastName.String,
		Username:         p.Username.String,
		PlanTierID:       p.PlanTierID,
		PlanTierName:     p.PlanTierName,
		OrganizationID:   p.OrganizationID,
		OrganizationName: p.OrganizationName,
		Role:             p.Role,
	}
	if p.LastSignInAt.Valid {
		formatted := p.LastSignInAt.Time.Format(http.TimeFormat)
		resp.LastSignInAt = &formatted
	}
	return resp
}

func (a *App) loadProfile(w http.ResponseWriter, r *http.Request, customerID string) (*db.CustomerProfile, bool) {
	profile, err := a.Store.GetCustomerProfile(r.Context(), customerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load account")
		return nil, false
	}
	return profile, true
}

// Signup creates a new organization and its first customer together. There
// is no billing wired up yet, so every new signup lands on the 'free' plan
// tier.
func (a *App) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.OrganizationName = strings.TrimSpace(req.OrganizationName)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	req.Username = strings.TrimSpace(req.Username)
	if req.Email == "" || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "email required, password must be at least 8 characters")
		return
	}
	if req.OrganizationName == "" {
		writeError(w, http.StatusBadRequest, "organization name is required")
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
	req.Name = strings.TrimSpace(req.FirstName + " " + req.LastName)

	if _, err := a.Store.GetCustomerByEmail(r.Context(), req.Email); err == nil {
		writeError(w, http.StatusConflict, "an account with this email already exists")
		return
	} else if !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not check existing accounts")
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

	organization, err := a.Store.CreateOrganization(r.Context(), req.OrganizationName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create organization")
		return
	}

	customer, err := a.Store.CreateCustomer(r.Context(), req.Email, req.Name, hash, organization.ID, req.FirstName, req.LastName, req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}
	if err := a.Store.AddOrganizationMember(r.Context(), organization.ID, customer.ID, db.RoleOwner); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	profile, ok := a.loadProfile(w, r, customer.ID)
	if !ok {
		return
	}

	a.startSession(w, r, customer.ID)
	writeJSON(w, http.StatusCreated, toProfileResponse(profile))
}

func (a *App) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	customer, err := a.Store.GetCustomerByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if !auth.CheckPassword(customer.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	a.Store.UpdateCustomerLastSignIn(r.Context(), customer.ID)

	profile, ok := a.loadProfile(w, r, customer.ID)
	if !ok {
		return
	}

	a.startSession(w, r, customer.ID)
	writeJSON(w, http.StatusOK, toProfileResponse(profile))
}

func (a *App) startSession(w http.ResponseWriter, r *http.Request, customerID string) {
	rawToken, hash, err := auth.NewSessionToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start session")
		return
	}
	expiresAt := time.Now().Add(auth.SessionTTL)
	if err := a.Store.CreateSession(r.Context(), hash, customerID, expiresAt); err != nil {
		writeError(w, http.StatusInternalServerError, "could not start session")
		return
	}
	auth.SetSessionCookie(w, rawToken, expiresAt, a.CookieSecure)
}

func (a *App) Logout(w http.ResponseWriter, r *http.Request) {
	if token, err := auth.TokenFromRequest(r); err == nil {
		a.Store.DeleteSession(r.Context(), auth.HashToken(token))
	}
	auth.ClearSessionCookie(w, a.CookieSecure)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) Me(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	profile, ok := a.loadProfile(w, r, customer.ID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toProfileResponse(profile))
}
