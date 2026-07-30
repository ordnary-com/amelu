package handlers

import (
	"errors"
	"net/http"
	"strings"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
)

const maxAPIKeysPerCustomer = 25

type apiKeyResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Prefix     string `json:"prefix"`
	CreatedAt  string `json:"createdAt"`
	LastUsedAt string `json:"lastUsedAt,omitempty"`
}

type createAPIKeyResponse struct {
	apiKeyResponse
	// Key is the only time the raw key is ever readable - it is not stored,
	// so it cannot be shown again on a later request.
	Key string `json:"key"`
}

func toAPIKeyResponse(k *db.APIKey) apiKeyResponse {
	out := apiKeyResponse{
		ID:        k.ID,
		Name:      k.Name,
		Prefix:    k.Prefix,
		CreatedAt: k.CreatedAt.Format(http.TimeFormat),
	}
	if k.LastUsedAt.Valid {
		out.LastUsedAt = k.LastUsedAt.Time.Format(http.TimeFormat)
	}
	return out
}

func (a *App) ListAPIKeys(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}

	keys, err := a.Store.ListAPIKeys(r.Context(), customer.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list API keys")
		return
	}

	out := make([]apiKeyResponse, 0, len(keys))
	for i := range keys {
		out = append(out, toAPIKeyResponse(&keys[i]))
	}
	writeJSON(w, http.StatusOK, out)
}

type createAPIKeyRequest struct {
	Name string `json:"name"`
}

// CreateAPIKey mints a key for the signed-in customer. Session-only (see
// auth.RequireSession in main.go): a key can never create another key.
func (a *App) CreateAPIKey(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}

	var req createAPIKeyRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "a name is required")
		return
	}
	if len(name) > 100 {
		writeError(w, http.StatusBadRequest, "name is too long")
		return
	}

	existing, err := a.Store.ListAPIKeys(r.Context(), customer.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create API key")
		return
	}
	if len(existing) >= maxAPIKeysPerCustomer {
		writeError(w, http.StatusConflict, "you've reached the maximum number of API keys, revoke one first")
		return
	}

	raw, hash, prefix, err := auth.NewAPIKey()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate API key")
		return
	}

	key, err := a.Store.CreateAPIKey(r.Context(), customer.ID, name, hash, prefix)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create API key")
		return
	}

	if customer.OrganizationID.Valid {
		a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
			"api_key.created", "api_key", key.ID, name, nil, requestIP(r))
	}

	writeJSON(w, http.StatusCreated, createAPIKeyResponse{apiKeyResponse: toAPIKeyResponse(key), Key: raw})
}

// RevokeAPIKey takes a key out of service immediately. Revoked keys stay in
// the table (the row is the only record that the key ever existed) but are
// never returned by ListAPIKeys and never authenticate again.
func (a *App) RevokeAPIKey(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}

	keyID := r.PathValue("id")
	if err := a.Store.RevokeAPIKey(r.Context(), customer.ID, keyID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "API key not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not revoke API key")
		return
	}

	if customer.OrganizationID.Valid {
		a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
			"api_key.revoked", "api_key", keyID, "", nil, requestIP(r))
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
