package handlers

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
)

// White-label webmail (docs/WEBMAIL.md): an organization on Go or Pro gets
// its own webmail address, <subdomain>.webmail.amelu.org right away and
// optionally its own hostname, where Roundcube shows the organization's
// logo, name and colour and nothing of Amelu. The Roundcube plugin
// amelu_theme reads the branding by hostname from WebmailBrandingForHost.

const maxWebmailLogoBytes = 256 << 10

var (
	webmailSubdomainRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`)
	webmailColorRe     = regexp.MustCompile(`^#[0-9a-f]{6}$`)
	hostnameLabelRe    = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)

	// Names that would look like ours or collide with our own records under
	// the webmail suffix (cname.<suffix> is the customers' CNAME target).
	reservedWebmailSubdomains = map[string]bool{
		"www": true, "mail": true, "webmail": true, "cname": true, "api": true, "app": true, "admin": true,
		"amelu": true, "ordnary": true, "beta": true, "static": true, "imap": true, "smtp": true, "mx": true,
		"support": true, "help": true, "status": true, "login": true, "auth": true, "billing": true,
	}
)

type webmailBrandingResponse struct {
	Allowed                  bool   `json:"allowed"`
	CanManage                bool   `json:"canManage"`
	Enabled                  bool   `json:"enabled"`
	Subdomain                string `json:"subdomain"`
	SubdomainSuffix          string `json:"subdomainSuffix"`
	URL                      string `json:"url"`
	CustomHostnamesAvailable bool   `json:"customHostnamesAvailable"`
	CustomHostname           string `json:"customHostname"`
	CustomHostnameStatus     string `json:"customHostnameStatus"`
	CustomHostnameError      string `json:"customHostnameError"`
	CNAMETarget              string `json:"cnameTarget"`
	ProductName              string `json:"productName"`
	AccentColor              string `json:"accentColor"`
	SupportURL               string `json:"supportUrl"`
	HasLogo                  bool   `json:"hasLogo"`
	LogoVersion              int64  `json:"logoVersion"`
}

// loadWebmailBranding returns the organization's branding, or an empty one
// when it never saved any.
func (a *App) loadWebmailBranding(r *http.Request, organizationID string) (*db.WebmailBranding, error) {
	b, err := a.Store.GetWebmailBranding(r.Context(), organizationID)
	if errors.Is(err, db.ErrNotFound) {
		return &db.WebmailBranding{OrganizationID: organizationID}, nil
	}
	return b, err
}

// webmailURLFor is where an organization's webmail lives: its own hostname
// once active, else its subdomain, else the shared webmail.amelu.org. Only
// while branding is on and the plan includes it.
func (a *App) webmailURLFor(b *db.WebmailBranding, allowed bool) string {
	if b == nil || !allowed || !b.Enabled {
		return a.WebmailURL
	}
	if b.CustomHostname != "" && b.CustomHostnameStatus == "active" {
		return "https://" + b.CustomHostname
	}
	if b.Subdomain != "" {
		return "https://" + b.Subdomain + "." + a.WebmailSubdomainSuffix
	}
	return a.WebmailURL
}

// organizationWebmailURL is webmailURLFor for "Open in webmail"; any lookup
// error falls back to the shared address rather than blocking the mailbox.
func (a *App) organizationWebmailURL(r *http.Request, organizationID string) string {
	allowed, err := a.Store.PlanAllowsWebmailBranding(r.Context(), organizationID)
	if err != nil || !allowed {
		return a.WebmailURL
	}
	b, err := a.Store.GetWebmailBranding(r.Context(), organizationID)
	if err != nil {
		return a.WebmailURL
	}
	return a.webmailURLFor(b, true)
}

// refreshCustomHostname asks Cloudflare how a pending hostname is doing, so
// the page reflects it without a background job.
func (a *App) refreshCustomHostname(r *http.Request, b *db.WebmailBranding) {
	if a.WebmailSaaS == nil || b.CustomHostnameID == "" || b.CustomHostnameStatus == "active" {
		return
	}
	h, err := a.WebmailSaaS.GetHostname(r.Context(), b.CustomHostnameID)
	if err != nil {
		return
	}
	if h.Status != b.CustomHostnameStatus || h.Error != b.CustomHostnameError {
		b.CustomHostnameStatus, b.CustomHostnameError = h.Status, h.Error
		a.Store.SetWebmailCustomHostnameStatus(r.Context(), b.OrganizationID, h.Status, h.Error)
	}
}

func (a *App) writeWebmailBranding(w http.ResponseWriter, r *http.Request, b *db.WebmailBranding, allowed, canManage bool) {
	resp := webmailBrandingResponse{
		Allowed:                  allowed,
		CanManage:                canManage,
		Enabled:                  b.Enabled,
		Subdomain:                b.Subdomain,
		SubdomainSuffix:          a.WebmailSubdomainSuffix,
		URL:                      a.webmailURLFor(b, allowed),
		CustomHostnamesAvailable: a.WebmailSaaS != nil,
		CustomHostname:           b.CustomHostname,
		CustomHostnameStatus:     b.CustomHostnameStatus,
		CustomHostnameError:      b.CustomHostnameError,
		CNAMETarget:              a.WebmailCNAMETarget,
		ProductName:              b.ProductName,
		AccentColor:              b.AccentColor,
		SupportURL:               b.SupportURL,
		HasLogo:                  b.LogoUpdatedAt.Valid,
	}
	if b.LogoUpdatedAt.Valid {
		resp.LogoVersion = b.LogoUpdatedAt.Time.Unix()
	}
	writeJSON(w, http.StatusOK, resp)
}

// GetWebmailBranding -> GET /api/organization/webmail
func (a *App) GetWebmailBranding(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	orgID := customer.OrganizationID.String
	allowed, err := a.Store.PlanAllowsWebmailBranding(r.Context(), orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load your plan")
		return
	}
	b, err := a.loadWebmailBranding(r, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load webmail settings")
		return
	}
	a.refreshCustomHostname(r, b)
	a.writeWebmailBranding(w, r, b, allowed, authz.CanManageDomains(role))
}

type updateWebmailBrandingRequest struct {
	Enabled     bool   `json:"enabled"`
	Subdomain   string `json:"subdomain"`
	ProductName string `json:"productName"`
	AccentColor string `json:"accentColor"`
	SupportURL  string `json:"supportUrl"`
}

// validateWebmailBranding normalises the request and returns a message for
// the first problem, or "".
func validateWebmailBranding(req *updateWebmailBrandingRequest) string {
	req.Subdomain = strings.ToLower(strings.TrimSpace(req.Subdomain))
	req.ProductName = strings.TrimSpace(req.ProductName)
	req.AccentColor = strings.ToLower(strings.TrimSpace(req.AccentColor))
	req.SupportURL = strings.TrimSpace(req.SupportURL)

	if req.Subdomain != "" {
		if !webmailSubdomainRe.MatchString(req.Subdomain) || strings.Contains(req.Subdomain, "--") {
			return "the address can only use lowercase letters, digits and single hyphens, 3 to 32 characters"
		}
		if reservedWebmailSubdomains[req.Subdomain] {
			return "this address is reserved, choose another one"
		}
	}
	if req.Enabled && req.Subdomain == "" {
		return "choose a webmail address before turning on your own webmail"
	}
	if len([]rune(req.ProductName)) > 40 {
		return "the name can be at most 40 characters"
	}
	for _, c := range req.ProductName {
		if unicode.IsControl(c) {
			return "the name contains characters that are not allowed"
		}
	}
	if req.AccentColor != "" && !webmailColorRe.MatchString(req.AccentColor) {
		return "the colour must be a hex value like #0043ce"
	}
	if req.SupportURL != "" {
		u, err := url.Parse(req.SupportURL)
		if err != nil || u.Scheme != "https" || u.Host == "" || len(req.SupportURL) > 200 {
			return "the support link must be an https:// address"
		}
	}
	return ""
}

// requireWebmailBrandingManager is requireOrgActor plus the role and plan
// checks every write here needs.
func (a *App) requireWebmailBrandingManager(w http.ResponseWriter, r *http.Request) (*db.Customer, bool) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return nil, false
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to change the webmail settings")
		return nil, false
	}
	allowed, err := a.Store.PlanAllowsWebmailBranding(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load your plan")
		return nil, false
	}
	if !allowed {
		writeErrorCode(w, http.StatusForbidden, "PLAN_REQUIRED", "your own webmail is part of the Go and Pro plans", "")
		return nil, false
	}
	return customer, true
}

// UpdateWebmailBranding -> PUT /api/organization/webmail
func (a *App) UpdateWebmailBranding(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireWebmailBrandingManager(w, r)
	if !ok {
		return
	}
	var req updateWebmailBrandingRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := validateWebmailBranding(&req); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	orgID := customer.OrganizationID.String
	b, err := a.loadWebmailBranding(r, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load webmail settings")
		return
	}
	b.Enabled, b.Subdomain, b.ProductName, b.AccentColor, b.SupportURL = req.Enabled, req.Subdomain, req.ProductName, req.AccentColor, req.SupportURL
	if err := a.Store.SaveWebmailBranding(r.Context(), b); err != nil {
		if errors.Is(err, db.ErrWebmailSubdomainTaken) {
			writeError(w, http.StatusConflict, "this address is already in use, choose another one")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not save webmail settings")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), orgID, &customer.ID, customer.Email,
		"webmail.branding_updated", "organization", orgID, req.Subdomain,
		map[string]any{"enabled": req.Enabled, "productName": req.ProductName, "accentColor": req.AccentColor}, requestIP(r))
	a.writeWebmailBranding(w, r, b, true, true)
}

// sniffWebmailLogo accepts PNG, JPEG and WebP only. No SVG: the logo is
// served from the webmail origin, where an SVG could run script.
func sniffWebmailLogo(data []byte) string {
	switch {
	case bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png"
	case bytes.HasPrefix(data, []byte{0xff, 0xd8, 0xff}):
		return "image/jpeg"
	case len(data) > 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		return "image/webp"
	}
	return ""
}

// UploadWebmailLogo -> PUT /api/organization/webmail/logo (raw image body)
func (a *App) UploadWebmailLogo(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireWebmailBrandingManager(w, r)
	if !ok {
		return
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, maxWebmailLogoBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read the image")
		return
	}
	if len(data) > maxWebmailLogoBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "the logo can be at most 256 KB")
		return
	}
	contentType := sniffWebmailLogo(data)
	if contentType == "" {
		writeError(w, http.StatusBadRequest, "the logo must be a PNG, JPEG or WebP image")
		return
	}
	orgID := customer.OrganizationID.String
	if err := a.Store.SetWebmailLogo(r.Context(), orgID, data, contentType); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save the logo")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), orgID, &customer.ID, customer.Email,
		"webmail.logo_updated", "organization", orgID, "", nil, requestIP(r))
	b, err := a.loadWebmailBranding(r, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load webmail settings")
		return
	}
	a.writeWebmailBranding(w, r, b, true, true)
}

// DeleteWebmailLogo -> DELETE /api/organization/webmail/logo
func (a *App) DeleteWebmailLogo(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireWebmailBrandingManager(w, r)
	if !ok {
		return
	}
	orgID := customer.OrganizationID.String
	if err := a.Store.SetWebmailLogo(r.Context(), orgID, nil, ""); err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove the logo")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), orgID, &customer.ID, customer.Email,
		"webmail.logo_removed", "organization", orgID, "", nil, requestIP(r))
	b, err := a.loadWebmailBranding(r, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load webmail settings")
		return
	}
	a.writeWebmailBranding(w, r, b, true, true)
}

// GetOrganizationWebmailLogo -> GET /api/organization/webmail/logo, the
// dashboard's preview.
func (a *App) GetOrganizationWebmailLogo(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	writeWebmailLogo(w, r, a, customer.OrganizationID.String, "private, max-age=60")
}

func writeWebmailLogo(w http.ResponseWriter, r *http.Request, a *App, organizationID, cacheControl string) {
	logo, contentType, err := a.Store.GetWebmailLogo(r.Context(), organizationID)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(logo)))
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(logo)
}

// normalizeHostname lowercases and validates a DNS name; "" when invalid.
func normalizeHostname(raw string) string {
	h := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(raw)), ".")
	if len(h) == 0 || len(h) > 253 {
		return ""
	}
	labels := strings.Split(h, ".")
	if len(labels) < 2 {
		return ""
	}
	for _, l := range labels {
		if !hostnameLabelRe.MatchString(l) {
			return ""
		}
	}
	return h
}

type setWebmailHostnameRequest struct {
	Hostname string `json:"hostname"`
}

// SetWebmailCustomHostname -> PUT /api/organization/webmail/custom-hostname
func (a *App) SetWebmailCustomHostname(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireWebmailBrandingManager(w, r)
	if !ok {
		return
	}
	if a.WebmailSaaS == nil {
		writeError(w, http.StatusServiceUnavailable, "custom webmail hostnames are not available on this server")
		return
	}
	var req setWebmailHostnameRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	hostname := normalizeHostname(req.Hostname)
	if hostname == "" {
		writeError(w, http.StatusBadRequest, "enter a hostname like webmail.example.com")
		return
	}
	if strings.HasSuffix(hostname, ".amelu.org") || hostname == "amelu.org" || strings.HasSuffix(hostname, ".ordnary.com") {
		writeError(w, http.StatusBadRequest, "use a hostname on one of your own domains")
		return
	}
	orgID := customer.OrganizationID.String
	owns, err := a.Store.OrganizationOwnsVerifiedDomain(r.Context(), orgID, hostname)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check your domains")
		return
	}
	if !owns {
		writeError(w, http.StatusBadRequest, "the hostname must be on one of your verified domains, for example webmail.yourdomain.com")
		return
	}
	b, err := a.loadWebmailBranding(r, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load webmail settings")
		return
	}
	if b.CustomHostname == hostname {
		a.refreshCustomHostname(r, b)
		a.writeWebmailBranding(w, r, b, true, true)
		return
	}
	if b.CustomHostnameID != "" || b.CustomRouteID != "" {
		a.removeCustomHostname(r, b)
	}

	h, err := a.WebmailSaaS.CreateHostname(r.Context(), hostname)
	if err != nil {
		writeUpstreamError(w, "could not register the hostname", err)
		return
	}
	routeID, err := a.WebmailSaaS.CreateRoute(r.Context(), hostname)
	if err != nil {
		a.WebmailSaaS.DeleteHostname(r.Context(), h.ID)
		writeUpstreamError(w, "could not register the hostname", err)
		return
	}
	if err := a.Store.SetWebmailCustomHostname(r.Context(), orgID, hostname, h.ID, routeID, h.Status, h.Error); err != nil {
		a.WebmailSaaS.DeleteRoute(r.Context(), routeID)
		a.WebmailSaaS.DeleteHostname(r.Context(), h.ID)
		if errors.Is(err, db.ErrWebmailSubdomainTaken) {
			writeError(w, http.StatusConflict, "this hostname is already in use")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not save the hostname")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), orgID, &customer.ID, customer.Email,
		"webmail.hostname_set", "organization", orgID, hostname, nil, requestIP(r))
	b, err = a.loadWebmailBranding(r, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load webmail settings")
		return
	}
	a.writeWebmailBranding(w, r, b, true, true)
}

// removeCustomHostname takes the hostname off Cloudflare; failures are left
// for an operator, the row is cleared either way.
func (a *App) removeCustomHostname(r *http.Request, b *db.WebmailBranding) {
	if a.WebmailSaaS != nil {
		if b.CustomRouteID != "" {
			a.WebmailSaaS.DeleteRoute(r.Context(), b.CustomRouteID)
		}
		if b.CustomHostnameID != "" {
			a.WebmailSaaS.DeleteHostname(r.Context(), b.CustomHostnameID)
		}
	}
	a.Store.SetWebmailCustomHostname(r.Context(), b.OrganizationID, "", "", "", "", "")
}

// DeleteWebmailCustomHostname -> DELETE /api/organization/webmail/custom-hostname
func (a *App) DeleteWebmailCustomHostname(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to change the webmail settings")
		return
	}
	orgID := customer.OrganizationID.String
	b, err := a.loadWebmailBranding(r, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load webmail settings")
		return
	}
	hostname := b.CustomHostname
	a.removeCustomHostname(r, b)
	a.Store.LogOrganizationAudit(r.Context(), orgID, &customer.ID, customer.Email,
		"webmail.hostname_removed", "organization", orgID, hostname, nil, requestIP(r))
	b, err = a.loadWebmailBranding(r, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load webmail settings")
		return
	}
	allowed, _ := a.Store.PlanAllowsWebmailBranding(r.Context(), orgID)
	a.writeWebmailBranding(w, r, b, allowed, true)
}

// brandingForHost resolves a webmail hostname to an organization whose
// branding is on and whose plan includes it.
func (a *App) brandingForHost(r *http.Request) (*db.WebmailBranding, bool) {
	host := normalizeHostname(r.URL.Query().Get("host"))
	if host == "" {
		return nil, false
	}
	subdomain := ""
	if suffix := "." + a.WebmailSubdomainSuffix; strings.HasSuffix(host, suffix) {
		subdomain = strings.TrimSuffix(host, suffix)
		if strings.Contains(subdomain, ".") {
			return nil, false
		}
	}
	b, err := a.Store.GetWebmailBrandingByHost(r.Context(), host, subdomain)
	if err != nil || !b.Enabled {
		return nil, false
	}
	allowed, err := a.Store.PlanAllowsWebmailBranding(r.Context(), b.OrganizationID)
	if err != nil || !allowed {
		return nil, false
	}
	return b, true
}

type publicWebmailBranding struct {
	ProductName string `json:"productName"`
	AccentColor string `json:"accentColor"`
	SupportURL  string `json:"supportUrl"`
	HasLogo     bool   `json:"hasLogo"`
	LogoVersion int64  `json:"logoVersion"`
}

// WebmailBrandingForHost -> GET /api/webmail-branding?host=, public: the
// login page is branded before anyone signs in. 404 means "use Amelu's own".
func (a *App) WebmailBrandingForHost(w http.ResponseWriter, r *http.Request) {
	b, ok := a.brandingForHost(r)
	if !ok {
		writeError(w, http.StatusNotFound, "no webmail branding for this host")
		return
	}
	out := publicWebmailBranding{ProductName: b.ProductName, AccentColor: b.AccentColor, SupportURL: b.SupportURL, HasLogo: b.LogoUpdatedAt.Valid}
	if b.LogoUpdatedAt.Valid {
		out.LogoVersion = b.LogoUpdatedAt.Time.Unix()
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, http.StatusOK, out)
}

// WebmailBrandingLogo -> GET /api/webmail-branding/logo?host=, public.
func (a *App) WebmailBrandingLogo(w http.ResponseWriter, r *http.Request) {
	b, ok := a.brandingForHost(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	writeWebmailLogo(w, r, a, b.OrganizationID, "public, max-age=300")
}
