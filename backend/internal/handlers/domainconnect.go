package handlers

import (
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"amelu/backend/internal/db"
	"amelu/backend/internal/dnscheck"
	"amelu/backend/internal/domainconnect"
	"amelu/backend/internal/stalwart"
)

type domainConnectResponse struct {
	Supported bool                    `json:"supported"`
	ApplyURL  string                  `json:"applyUrl,omitempty"`
	Provider  *domainconnect.Provider `json:"provider,omitempty"`
}

// GetDomainConnect checks whether the domain's DNS provider supports Domain
// Connect and, if so, returns a signed apply URL the frontend redirects the
// browser to. Returns supported:false (not an error) for any domain whose
// provider doesn't support it, hasn't published discovery records, or where
// Amelu's own template isn't configured yet. supported:true without an
// applyUrl means every record the template writes is already in place.
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

	provider := domainconnect.DetectProvider(r.Context(), domain.Name)
	unsupported := domainConnectResponse{Supported: false, Provider: provider}
	if a.DomainConnect == nil {
		writeJSON(w, http.StatusOK, unsupported)
		return
	}

	settings, ok := domainconnect.Supported(r.Context(), domain.Name)
	if !ok {
		writeJSON(w, http.StatusOK, unsupported)
		return
	}

	stalwartDomain, err := a.Stalwart.GetDomain(r.Context(), domain.Name)
	if err != nil {
		writeUpstreamError(w, "could not fetch DNS records from mail cluster", err)
		return
	}
	zoneFile := stalwart.UseAmeluSPF(stalwart.FilterTLSIncompatibleRecords(stalwartDomain.DNSZoneFile))
	records := stalwart.ParseZoneFile(zoneFile)
	vars, ok := recordVarsFromZoneFile(records, domain.Name)
	if !ok {
		// The template's fixed parts no longer match what Stalwart wants;
		// applying it would write records the DNS check then flags.
		writeJSON(w, http.StatusOK, unsupported)
		return
	}

	groups := groupsToApply(dnscheck.Check(r.Context(), records), domain.Name)
	if len(groups) == 0 {
		writeJSON(w, http.StatusOK, domainConnectResponse{Supported: true, Provider: provider})
		return
	}

	redirectURI := a.FrontendOrigin + "/domains/" + url.PathEscape(domain.ID) + "/dns"
	applyURL, err := a.DomainConnect.BuildApplyURL(settings.URLSyncUX, domain.Name, redirectURI, vars, groups)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not build domain connect url: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, domainConnectResponse{Supported: true, ApplyURL: applyURL, Provider: provider})
}

// templateTXT are the TXT records template.json fixes; the zone file must
// contain them unchanged for the template to stand in for it.
var templateTXT = map[string]string{
	"@":          stalwart.AmeluSPF,
	"_dmarc":     "v=DMARC1; p=reject; rua=mailto:postmaster@%s",
	"_smtp._tls": "v=TLSRPTv1; rua=mailto:postmaster@%s",
}

const (
	dkimEd25519Prefix = "v=DKIM1; k=ed25519; h=sha256; p="
	dkimRSAPrefix     = "v=DKIM1; k=rsa; h=sha256; p="
)

// recordVarsFromZoneFile maps Stalwart's computed records onto the template
// variables, reporting false when a record differs from what template.json
// would write.
func recordVarsFromZoneFile(records []stalwart.ZoneRecord, domainName string) (domainconnect.RecordVars, bool) {
	var vars domainconnect.RecordVars
	for _, rec := range records {
		host := relativeHost(rec.Name, domainName)
		switch rec.Type {
		case "MX":
			if strings.TrimSuffix(rec.Content, ".") != "marduk.mx.amelu.org" || rec.Priority == nil || *rec.Priority != 10 {
				return vars, false
			}
		case "TXT":
			if selector, ok := strings.CutSuffix(host, "._domainkey"); ok {
				switch {
				case strings.HasPrefix(rec.Content, dkimEd25519Prefix):
					vars.Ed25519Selector, vars.Ed25519Key = selector, strings.TrimPrefix(rec.Content, dkimEd25519Prefix)
				case strings.HasPrefix(rec.Content, dkimRSAPrefix):
					vars.RSASelector, vars.RSAKey = selector, strings.TrimPrefix(rec.Content, dkimRSAPrefix)
				default:
					return vars, false
				}
				continue
			}
			if want, ok := templateTXT[host]; ok {
				if strings.Contains(want, "%s") {
					want = fmt.Sprintf(want, strings.TrimSuffix(domainName, "."))
				}
				if rec.Content != want {
					return vars, false
				}
			}
		}
	}
	return vars, vars.Ed25519Key != "" && vars.RSAKey != ""
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

// groupsToApply picks the template groups with a record that isn't in place
// yet. A TXT group only goes along while its name has no TXT record at all:
// Cloudflare adds ours next to an existing DMARC policy or DKIM key instead
// of replacing it (and two DMARC policies count as none), and re-adding an
// identical RSA DKIM record fails there.
func groupsToApply(checks []dnscheck.RecordCheck, domainName string) []string {
	var groups []string
	add := func(group string) {
		if !slices.Contains(groups, group) {
			groups = append(groups, group)
		}
	}
	for _, check := range checks {
		if check.Status == dnscheck.StatusMatched {
			continue
		}
		host := relativeHost(check.Name, domainName)
		switch {
		case check.Type == "MX", check.Type == "TXT" && host == "@":
			add(domainconnect.GroupMail)
		case check.Type == "SRV":
			add(domainconnect.GroupDiscovery)
		case check.Type != "TXT" || check.Status != dnscheck.StatusMissing:
		case strings.HasSuffix(host, "._domainkey") && strings.HasPrefix(check.Expected, dkimEd25519Prefix):
			add(domainconnect.GroupDKIMEd25519)
		case strings.HasSuffix(host, "._domainkey") && strings.HasPrefix(check.Expected, dkimRSAPrefix):
			add(domainconnect.GroupDKIMRSA)
		case host == "_dmarc":
			add(domainconnect.GroupDMARC)
		case host == "_smtp._tls":
			add(domainconnect.GroupTLSRPT)
		}
	}
	return groups
}
