package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
)

// Connector scopes. send is never implied by another scope: a customer has to
// tick it on the consent page.
const (
	ScopeRead  = "mail.read"
	ScopeDraft = "mail.draft"
	ScopeSend  = "mail.send"
)

var allScopes = []string{ScopeRead, ScopeDraft, ScopeSend}

const (
	authCodeTTL    = 5 * time.Minute
	accessTokenTTL = time.Hour
	maxRedirects   = 10
)

func validScopes(requested []string) ([]string, bool) {
	seen := map[string]bool{}
	out := make([]string, 0, len(requested))
	for _, s := range requested {
		known := false
		for _, a := range allScopes {
			known = known || a == s
		}
		if !known {
			return nil, false
		}
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out, len(out) > 0
}

func hasScope(scopes []string, want string) bool {
	for _, s := range scopes {
		if s == want {
			return true
		}
	}
	return false
}

// OAuthProtectedResourceMetadata and OAuthAuthorizationServerMetadata are the
// two discovery documents an MCP client fetches before it can start the
// flow (RFC 9728 and RFC 8414).
func (a *App) OAuthProtectedResourceMetadata(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"resource":                 a.PublicAPIURL + "/mcp",
		"authorization_servers":    []string{a.PublicAPIURL},
		"scopes_supported":         allScopes,
		"bearer_methods_supported": []string{"header"},
	})
}

func (a *App) OAuthAuthorizationServerMetadata(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer":                                a.PublicAPIURL,
		"authorization_endpoint":                a.FrontendOrigin + "/connect",
		"token_endpoint":                        a.PublicAPIURL + "/oauth/token",
		"registration_endpoint":                 a.PublicAPIURL + "/oauth/register",
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code", "refresh_token"},
		"code_challenge_methods_supported":      []string{"S256"},
		"token_endpoint_auth_methods_supported": []string{"none"},
		"scopes_supported":                      allScopes,
	})
}

func oauthError(w http.ResponseWriter, status int, code, description string) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, status, map[string]string{"error": code, "error_description": description})
}

func validRedirectURI(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Fragment != "" || u.Host == "" {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	host := u.Hostname()
	return u.Scheme == "http" && (host == "localhost" || host == "127.0.0.1")
}

type registerClientRequest struct {
	ClientName   string   `json:"client_name"`
	RedirectURIs []string `json:"redirect_uris"`
}

// OAuthRegister is dynamic client registration (RFC 7591). Clients are public:
// the PKCE verifier is the only proof they hold, so registration grants
// nothing until a customer approves a specific mailbox on the consent page.
func (a *App) OAuthRegister(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<16)
	var req registerClientRequest
	if err := decodeJSON(r, &req); err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_client_metadata", "invalid request body")
		return
	}
	name := strings.TrimSpace(req.ClientName)
	if name == "" {
		name = "Unnamed app"
	}
	if len(name) > 100 {
		name = name[:100]
	}
	if len(req.RedirectURIs) == 0 || len(req.RedirectURIs) > maxRedirects {
		oauthError(w, http.StatusBadRequest, "invalid_redirect_uri", "between 1 and 10 redirect_uris are required")
		return
	}
	for _, u := range req.RedirectURIs {
		if !validRedirectURI(u) || strings.ContainsAny(u, " \t\r\n") {
			oauthError(w, http.StatusBadRequest, "invalid_redirect_uri", "redirect_uris must be https (or http on localhost)")
			return
		}
	}

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		oauthError(w, http.StatusInternalServerError, "server_error", "could not register client")
		return
	}
	id := "amelu_client_" + hex.EncodeToString(b)
	if err := a.Store.CreateOAuthClient(r.Context(), id, name, req.RedirectURIs); err != nil {
		oauthError(w, http.StatusInternalServerError, "server_error", "could not register client")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusCreated, map[string]any{
		"client_id":                  id,
		"client_name":                name,
		"redirect_uris":              req.RedirectURIs,
		"grant_types":                []string{"authorization_code", "refresh_token"},
		"response_types":             []string{"code"},
		"token_endpoint_auth_method": "none",
	})
}

type connectMailbox struct {
	ID      string `json:"id"`
	Address string `json:"address"`
}

// connectableMailboxes are the mailboxes the signed-in customer may hand to an
// assistant: only owners and admins can open mailbox contents at all.
func (a *App) connectableMailboxes(r *http.Request, customer *db.Customer) ([]connectMailbox, bool, error) {
	if !customer.OrganizationID.Valid {
		return nil, false, nil
	}
	role, err := a.Store.GetMemberRole(r.Context(), customer.OrganizationID.String, customer.ID)
	if err != nil {
		return nil, false, err
	}
	if !authz.CanAccessMailboxContents(role) {
		return nil, false, nil
	}
	domains, err := a.Store.ListDomainsForOrganization(r.Context(), customer.OrganizationID.String)
	if err != nil {
		return nil, false, err
	}
	out := []connectMailbox{}
	for _, d := range domains {
		boxes, err := a.Store.ListMailboxes(r.Context(), d.ID)
		if err != nil {
			return nil, false, err
		}
		for _, m := range boxes {
			if m.Status == "active" {
				out = append(out, connectMailbox{ID: m.ID, Address: m.LocalPart + "@" + d.Name})
			}
		}
	}
	return out, true, nil
}

func (a *App) loadAuthorizeClient(w http.ResponseWriter, r *http.Request, clientID, redirectURI string) (*db.OAuthClient, bool) {
	client, err := a.Store.GetOAuthClient(r.Context(), clientID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "unknown application")
		return nil, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load application")
		return nil, false
	}
	for _, u := range client.RedirectURIs {
		if u == redirectURI {
			return client, true
		}
	}
	writeError(w, http.StatusBadRequest, "redirect_uri is not registered for this application")
	return nil, false
}

// GetConnectRequest feeds the consent page: who is asking and which mailboxes
// the customer can choose from.
func (a *App) GetConnectRequest(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	client, ok := a.loadAuthorizeClient(w, r, q.Get("client_id"), q.Get("redirect_uri"))
	if !ok {
		return
	}
	requested := strings.Fields(q.Get("scope"))
	if len(requested) == 0 {
		requested = []string{ScopeRead, ScopeDraft}
	}
	scopes, ok := validScopes(requested)
	if !ok {
		writeError(w, http.StatusBadRequest, "unsupported scope")
		return
	}

	mailboxes, allowed, err := a.connectableMailboxes(r, customer)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list mailboxes")
		return
	}

	redirectHost := ""
	if u, err := url.Parse(q.Get("redirect_uri")); err == nil {
		redirectHost = u.Host
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"clientName":   client.Name,
		"redirectHost": redirectHost,
		"scopes":       scopes,
		"allowed":      allowed,
		"mailboxes":    mailboxes,
	})
}

type connectApproveRequest struct {
	ClientID      string   `json:"clientId"`
	RedirectURI   string   `json:"redirectUri"`
	State         string   `json:"state"`
	CodeChallenge string   `json:"codeChallenge"`
	MailboxID     string   `json:"mailboxId"`
	Scopes        []string `json:"scopes"`
	Deny          bool     `json:"deny"`
}

func redirectWith(base string, params map[string]string) string {
	u, _ := url.Parse(base)
	q := u.Query()
	for k, v := range params {
		if v != "" {
			q.Set(k, v)
		}
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// ApproveConnect completes the consent step. Session-only: an API key or a
// connector token can never approve a connector.
func (a *App) ApproveConnect(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	var req connectApproveRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	client, ok := a.loadAuthorizeClient(w, r, req.ClientID, req.RedirectURI)
	if !ok {
		return
	}

	if req.Deny {
		writeJSON(w, http.StatusOK, map[string]string{"redirectUrl": redirectWith(req.RedirectURI, map[string]string{
			"error": "access_denied", "state": req.State,
		})})
		return
	}

	scopes, ok := validScopes(req.Scopes)
	if !ok {
		writeError(w, http.StatusBadRequest, "choose at least one permission")
		return
	}
	if len(req.CodeChallenge) < 43 || len(req.CodeChallenge) > 128 {
		writeError(w, http.StatusBadRequest, "missing PKCE code challenge")
		return
	}

	mailboxes, allowed, err := a.connectableMailboxes(r, customer)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list mailboxes")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only organization owners and admins can connect a mailbox")
		return
	}
	address := ""
	for _, m := range mailboxes {
		if m.ID == req.MailboxID {
			address = m.Address
		}
	}
	if address == "" {
		writeError(w, http.StatusBadRequest, "choose one of your mailboxes")
		return
	}

	code, hash, err := auth.NewAuthorizationCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create authorization code")
		return
	}
	err = a.Store.CreateOAuthCode(r.Context(), hash, db.OAuthCode{
		ClientID: client.ID, CustomerID: customer.ID, MailboxID: req.MailboxID, Scopes: scopes,
		RedirectURI: req.RedirectURI, CodeChallenge: req.CodeChallenge,
	}, authCodeTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create authorization code")
		return
	}

	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"connector.authorized", "mailbox", req.MailboxID, client.Name+" ("+address+": "+strings.Join(scopes, ", ")+")", nil, requestIP(r))

	writeJSON(w, http.StatusOK, map[string]string{"redirectUrl": redirectWith(req.RedirectURI, map[string]string{
		"code": code, "state": req.State,
	})})
}

// OAuthToken is the token endpoint: authorization_code and refresh_token
// grants, public clients only.
func (a *App) OAuthToken(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<16)
	if err := r.ParseForm(); err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_request", "expected a form-encoded body")
		return
	}
	clientID := r.PostForm.Get("client_id")

	access, accessHash, err := auth.NewConnectorToken(auth.ConnectorAccessPrefix)
	if err != nil {
		oauthError(w, http.StatusInternalServerError, "server_error", "could not issue token")
		return
	}
	refresh, refreshHash, err := auth.NewConnectorToken(auth.ConnectorRefreshPrefix)
	if err != nil {
		oauthError(w, http.StatusInternalServerError, "server_error", "could not issue token")
		return
	}

	var scopes []string
	switch r.PostForm.Get("grant_type") {
	case "authorization_code":
		grant, err := a.Store.ConsumeOAuthCode(r.Context(), auth.HashToken(r.PostForm.Get("code")))
		if err != nil {
			oauthError(w, http.StatusBadRequest, "invalid_grant", "the authorization code is invalid or expired")
			return
		}
		if grant.ClientID != clientID || grant.RedirectURI != r.PostForm.Get("redirect_uri") ||
			!auth.VerifyPKCE(grant.CodeChallenge, r.PostForm.Get("code_verifier")) {
			oauthError(w, http.StatusBadRequest, "invalid_grant", "the authorization code does not match this request")
			return
		}
		if err := a.Store.CreateConnectorToken(r.Context(), *grant, accessHash, accessTokenTTL, refreshHash); err != nil {
			oauthError(w, http.StatusInternalServerError, "server_error", "could not issue token")
			return
		}
		scopes = grant.Scopes

	case "refresh_token":
		grant, err := a.Store.RotateConnectorToken(r.Context(), auth.HashToken(r.PostForm.Get("refresh_token")), clientID, accessHash, accessTokenTTL, refreshHash)
		if err != nil {
			oauthError(w, http.StatusBadRequest, "invalid_grant", "the refresh token is invalid or was revoked")
			return
		}
		scopes = grant.Scopes

	default:
		oauthError(w, http.StatusBadRequest, "unsupported_grant_type", "use authorization_code or refresh_token")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token":  access,
		"token_type":    "Bearer",
		"expires_in":    int(accessTokenTTL.Seconds()),
		"refresh_token": refresh,
		"scope":         strings.Join(scopes, " "),
	})
}

type connectorResponse struct {
	ID         string   `json:"id"`
	ClientName string   `json:"clientName"`
	Mailbox    string   `json:"mailbox"`
	Scopes     []string `json:"scopes"`
	CreatedAt  string   `json:"createdAt"`
	LastUsedAt string   `json:"lastUsedAt,omitempty"`
}

func (a *App) ListConnectors(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	rows, err := a.Store.ListConnectors(r.Context(), customer.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list connectors")
		return
	}
	out := make([]connectorResponse, 0, len(rows))
	for _, c := range rows {
		item := connectorResponse{ID: c.ID, ClientName: c.ClientName, Mailbox: c.MailboxAddr, Scopes: c.Scopes, CreatedAt: c.CreatedAt.Format(http.TimeFormat)}
		if c.LastUsedAt.Valid {
			item.LastUsedAt = c.LastUsedAt.Time.Format(http.TimeFormat)
		}
		out = append(out, item)
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *App) RevokeConnector(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if err := a.Store.RevokeConnector(r.Context(), customer.ID, id); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "connector not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not revoke connector")
		return
	}
	if customer.OrganizationID.Valid {
		a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
			"connector.revoked", "connector", id, "", nil, requestIP(r))
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
