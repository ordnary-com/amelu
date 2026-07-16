package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/db"
	"amelu/backend/internal/dnscheck"
	"amelu/backend/internal/stalwart"
)

// GetDomainDNS returns the DNS records Stalwart expects for a domain (so the
// customer can paste them into their own registrar) plus a live lookup of
// what's actually published right now. If everything checkable matches, the
// domain is flagged active.
func (a *App) GetDomainDNS(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domainID := r.PathValue("id")

	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, domainID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	stalwartDomain, err := a.Stalwart.GetDomain(r.Context(), domain.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not fetch expected DNS records from mail cluster: "+err.Error())
		return
	}

	records := stalwart.ParseZoneFile(stalwartDomain.DNSZoneFile)
	records = stalwart.AppendBackupMXRecords(records, domain.Name)
	checks := dnscheck.Check(r.Context(), records)

	for _, rec := range records {
		if rec.Type == "TXT" && strings.Contains(rec.Name, "._domainkey.") {
			selector := strings.SplitN(rec.Name, "._domainkey.", 2)[0]
			a.Store.UpdateDomainDKIMSelector(r.Context(), domain.ID, selector)
			break
		}
	}

	if dnscheck.AllCheckedMatch(checks) && domain.Status != "active" {
		a.Store.MarkDomainVerified(r.Context(), domain.ID)
	} else if !dnscheck.AllCheckedMatch(checks) && domain.Status == "active" {
		a.Store.UpdateDomainStatus(r.Context(), domain.ID, "dns_pending", "")
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"records": checks,
	})
}

// GetDomainBindFile returns Stalwart's own computed zone file for the
// domain as a downloadable BIND-format file, for pasting into a
// registrar's "import zone file" tool (e.g. Cloudflare's DNS import) as a
// faster alternative to adding each record from the table by hand. Served
// verbatim from Stalwart rather than reconstructed from the parsed record
// list, since Stalwart already formats long TXT values (the RSA DKIM key)
// as correctly-chunked quoted strings and that's fiddly to get exactly
// right a second time.
func (a *App) GetDomainBindFile(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domainID := r.PathValue("id")

	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, domainID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	stalwartDomain, err := a.Stalwart.GetDomain(r.Context(), domain.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not fetch DNS records from mail cluster: "+err.Error())
		return
	}

	header := fmt.Sprintf("; Amelu DNS zone file for %s\n; Generated %s\n; Import this into your DNS provider (e.g. Cloudflare > DNS > Import and Export).\n\n",
		domain.Name, time.Now().UTC().Format(time.RFC3339))
	backupMX := stalwart.AppendBackupMXZoneFileLines(domain.Name)

	w.Header().Set("Content-Type", "text/dns")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zone"`, domain.Name))
	w.Write([]byte(header + stalwartDomain.DNSZoneFile + backupMX))
}
