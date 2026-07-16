package handlers

import (
	"net/http"
	"strings"

	"amelu/backend/internal/db"
	"amelu/backend/internal/domainconnect"
	"amelu/backend/internal/stalwart"
)

type domainConnectResponse struct {
	Supported bool   `json:"supported"`
	ApplyURL  string `json:"applyUrl,omitempty"`
}

// GetDomainConnect checks whether the domain's DNS provider supports Domain
// Connect and, if so, returns a signed apply URL the frontend redirects the
// browser to. Returns supported:false (not an error) for any domain whose
// provider doesn't support it, hasn't published discovery records, or where
// Amelu's own template isn't configured yet.
func (a *App) GetDomainConnect(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domainID := r.PathValue("id")

	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, domainID)
	if err != nil {
		if err == db.ErrNotFound {
			writeError(w, http.StatusNotFound, "domain not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	if a.DomainConnect == nil {
		writeJSON(w, http.StatusOK, domainConnectResponse{Supported: false})
		return
	}

	settings, ok := domainconnect.Supported(r.Context(), domain.Name)
	if !ok {
		writeJSON(w, http.StatusOK, domainConnectResponse{Supported: false})
		return
	}

	stalwartDomain, err := a.Stalwart.GetDomain(r.Context(), domain.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not fetch DNS records from mail cluster: "+err.Error())
		return
	}
	records := stalwart.ParseZoneFile(stalwartDomain.DNSZoneFile)
	vars := recordVarsFromZoneFile(records, domain.Name)

	applyURL, err := a.DomainConnect.BuildApplyURL(settings.URLSyncUX, domain.Name, vars)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not build domain connect url: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, domainConnectResponse{Supported: true, ApplyURL: applyURL})
}

// recordVarsFromZoneFile maps Stalwart's computed records onto the
// domain-specific template variables referenced in template.json.
func recordVarsFromZoneFile(records []stalwart.ZoneRecord, domainName string) domainconnect.RecordVars {
	var vars domainconnect.RecordVars
	for _, rec := range records {
		if rec.Type != "TXT" {
			continue
		}
		host := relativeHost(rec.Name, domainName)
		switch {
		case strings.Contains(rec.Name, "_domainkey") && strings.Contains(rec.Content, "k=ed25519"):
			vars.Ed25519Selector = host
			vars.Ed25519Value = rec.Content
		case strings.Contains(rec.Name, "_domainkey") && strings.Contains(rec.Content, "k=rsa"):
			vars.RSASelector = host
			vars.RSAValue = rec.Content
		case strings.HasPrefix(rec.Name, "_dmarc."):
			vars.DMARCValue = rec.Content
		case strings.HasPrefix(rec.Name, "_mta-sts."):
			vars.MTASTSValue = rec.Content
		case strings.HasPrefix(rec.Name, "_smtp._tls."):
			vars.TLSRPTValue = rec.Content
		case strings.HasPrefix(rec.Name, "_ua-auto-config."):
			vars.UAAutoConfValue = rec.Content
		}
	}
	return vars
}

// relativeHost strips the trailing ".<domainName>." from a fully qualified
// record name, matching Domain Connect's relative "host" field convention.
func relativeHost(recordName, domainName string) string {
	name := strings.TrimSuffix(recordName, ".")
	domainName = strings.TrimSuffix(domainName, ".")
	if name == domainName {
		return "@"
	}
	return strings.TrimSuffix(name, "."+domainName)
}
