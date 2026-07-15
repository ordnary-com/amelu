// Package ordnaryauth is a trimmed Go port of ordnary-workspace's
// @ordnary/auth OIDC client (and its existing Go port at
// services/nolan-core/internal/ordnaryauth), scoped to exactly what Amelu
// needs: redirect to Ordnary's authorize endpoint, exchange the code, and
// fetch the authenticated user's profile.
//
// Unlike nolan/loom/metamorph, Amelu does not adopt Ordnary's own
// <prefix>_session cookie or its useAuth() model - Amelu already has its own
// server-side session store (internal/auth, the "amelu_session" cookie) used
// by every existing route. So this package only owns the transient OAuth
// round-trip (the signed <prefix>_oauth cookie carrying state/PKCE/returnTo);
// the caller (handlers.App.OrdnaryCallback) is responsible for turning the
// resulting User into an Amelu customer and starting a normal Amelu session.
package ordnaryauth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Config carries everything the OIDC client and cookie codec need.
type Config struct {
	// Issuer is Ordnary identity's base URL (no trailing slash), e.g.
	// https://accounts.ordnary.com.
	Issuer string
	// ClientID is the OAuth client registered for Amelu in ordnary-identity.
	ClientID string
	// ClientSecret is only required for a confidential client - leave empty
	// for a public/PKCE-only client (see docs/cloudflare/SECRETS.md).
	ClientSecret string
	// RedirectURI is Amelu's OAuth callback URL, must exactly match a
	// redirect URI registered for ClientID (no wildcards - see
	// ordnary-identity's OAuthRedirectUri model).
	RedirectURI string
	// CookieSecret signs the transient OAuth login-state cookie.
	CookieSecret string
	// Production toggles the Secure flag on that cookie.
	Production bool
}

const cookieName = "amelu_ordnary_oauth"

func (c *Config) scopes() []string   { return []string{"openid", "profile", "email"} }
func (c *Config) codec() cookieCodec { return newCookieCodec(c.CookieSecret) }

// User is derived from Ordnary identity's /api/oauth/userinfo response.
type User struct {
	ID            string
	Name          string
	Email         string
	EmailVerified bool
}

// loginState is the shape of the signed amelu_ordnary_oauth cookie carried
// through the OAuth round-trip.
type loginState struct {
	State        string `json:"state"`
	CodeVerifier string `json:"codeVerifier"`
	ReturnTo     string `json:"returnTo"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}

type errorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description,omitempty"`
}

// APIError wraps a non-2xx response from Ordnary identity.
type APIError struct {
	Status int
	Body   errorResponse
}

func (e *APIError) Error() string {
	if e.Body.ErrorDescription != "" {
		return e.Body.ErrorDescription
	}
	return e.Body.Error
}

// Login redirects the browser to Ordnary identity's authorize endpoint.
func (c *Config) Login(w http.ResponseWriter, r *http.Request) {
	state := createRandomString(16)
	verifier, challenge := createPKCEPair()
	returnTo := r.URL.Query().Get("returnTo")

	ls := loginState{State: state, CodeVerifier: verifier, ReturnTo: returnTo}
	w.Header().Set("Set-Cookie", serializeCookie(cookieName, c.codec().encodeSigned(ls), cookieOpts{
		maxAge: 600, httpOnly: true, production: c.Production,
	}))

	http.Redirect(w, r, c.authorizationURL(state, challenge), http.StatusFound)
}

func (c *Config) authorizationURL(state, codeChallenge string) string {
	u, _ := url.Parse(c.Issuer + "/oauth/authorize")
	q := u.Query()
	q.Set("response_type", "code")
	q.Set("client_id", c.ClientID)
	q.Set("redirect_uri", c.RedirectURI)
	q.Set("scope", strings.Join(c.scopes(), " "))
	q.Set("state", state)
	q.Set("code_challenge", codeChallenge)
	q.Set("code_challenge_method", "S256")
	u.RawQuery = q.Encode()
	return u.String()
}

// CallbackResult is what a successful Callback exchange yields.
type CallbackResult struct {
	User     User
	ReturnTo string
}

// Callback validates the OAuth state, exchanges the code, and fetches the
// user's profile. It always clears the transient login-state cookie, even on
// failure. The caller is responsible for turning the result into an Amelu
// session (or reporting an error) and issuing the HTTP response.
func (c *Config) Callback(w http.ResponseWriter, r *http.Request) (*CallbackResult, error) {
	q := r.URL.Query()
	code := q.Get("code")
	state := q.Get("state")

	var ls loginState
	hasState := c.codec().decodeSigned(getCookie(r, cookieName), &ls)
	w.Header().Add("Set-Cookie", clearCookie(cookieName))

	if oauthErr := q.Get("error"); oauthErr != "" {
		return nil, &APIError{Status: http.StatusBadRequest, Body: errorResponse{Error: oauthErr, ErrorDescription: q.Get("error_description")}}
	}
	if code == "" || state == "" || !hasState || ls.State != state {
		return nil, &APIError{Status: http.StatusBadRequest, Body: errorResponse{Error: "invalid_request", ErrorDescription: "state mismatch"}}
	}

	tokens, err := c.exchangeCode(r.Context(), code, ls.CodeVerifier)
	if err != nil {
		return nil, err
	}
	user, err := c.fetchUserInfo(r.Context(), tokens.AccessToken)
	if err != nil {
		return nil, err
	}
	return &CallbackResult{User: *user, ReturnTo: ls.ReturnTo}, nil
}

func (c *Config) exchangeCode(ctx context.Context, code, codeVerifier string) (*tokenResponse, error) {
	body := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {c.RedirectURI},
		"client_id":     {c.ClientID},
		"code_verifier": {codeVerifier},
	}
	if c.ClientSecret != "" {
		body.Set("client_secret", c.ClientSecret)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Issuer+"/api/oauth/token", strings.NewReader(body.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, parseErrorResponse(resp)
	}
	var tok tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return nil, err
	}
	return &tok, nil
}

func (c *Config) fetchUserInfo(ctx context.Context, accessToken string) (*User, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.Issuer+"/api/oauth/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, parseErrorResponse(resp)
	}
	var info struct {
		Sub           string `json:"sub"`
		Name          string `json:"name"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	if info.Email == "" {
		return nil, errors.New("ordnary identity did not return an email for this user")
	}
	name := info.Name
	if name == "" {
		name = info.Email
	}
	return &User{ID: info.Sub, Name: name, Email: info.Email, EmailVerified: info.EmailVerified}, nil
}

func parseErrorResponse(resp *http.Response) error {
	var body errorResponse
	data, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(data, &body); err != nil || body.Error == "" {
		body = errorResponse{Error: "unknown_error", ErrorDescription: resp.Status}
	}
	return &APIError{Status: resp.StatusCode, Body: body}
}
