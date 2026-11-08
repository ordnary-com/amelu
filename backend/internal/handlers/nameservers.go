package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/cfdns"
	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

// managedComment marks the records Amelu puts in a hosted zone for mail.
// They are kept in step with Stalwart and can't be edited in the dashboard,
// so a customer can't break their own mail by accident.
const managedComment = "Managed by Amelu for email"

// GetAmeluNameservers tells the add-domain page whether the option is on
// and which names to show.
func (a *App) GetAmeluNameservers(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireCustomer(w, r); !ok {
		return
	}
	if a.AmeluDNS == nil {
		writeJSON(w, http.StatusOK, map[string]any{"available": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"available": true, "nameservers": a.AmeluDNS.Nameservers()})
}

type nameserversResponse struct {
	// Mode is "amelu" when Amelu hosts the zone, else "external".
	Mode        string   `json:"mode"`
	Available   bool     `json:"available"`
	Status      string   `json:"status,omitempty"`
	Nameservers []string `json:"nameservers,omitempty"`
	ActivatedAt *string  `json:"activatedAt,omitempty"`
}

// GetDomainNameservers reports whether the domain is on Amelu nameservers
// and, while it's still pending, asks Cloudflare whether the registrar has
// switched over yet.
func (a *App) GetDomainNameservers(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOrgDomain(w, r, customer)
	if !ok {
		return
	}
	resp := nameserversResponse{Mode: "external", Available: a.AmeluDNS != nil}
	zone, err := a.Store.GetDNSZone(r.Context(), domain.ID)
	if errors.Is(err, db.ErrNotFound) {
		writeJSON(w, http.StatusOK, resp)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load nameservers")
		return
	}
	if zone.Status != "active" && a.AmeluDNS != nil {
		if z, err := a.AmeluDNS.GetZone(r.Context(), zone.ZoneID); err == nil && z.Status == "active" {
			a.Store.MarkDNSZoneActive(r.Context(), domain.ID)
			a.Store.LogActivity(r.Context(), domain.ID, "domain.nameservers_active", "Nameservers point at Amelu")
			zone, _ = a.Store.GetDNSZone(r.Context(), domain.ID)
		} else if err == nil && time.Since(zone.CreatedAt) > time.Minute {
			a.AmeluDNS.CheckActivation(r.Context(), zone.ZoneID)
		}
	}
	resp.Mode, resp.Status, resp.Nameservers = "amelu", zone.Status, zone.Nameservers
	if zone.ActivatedAt.Valid {
		at := zone.ActivatedAt.Time.Format(http.TimeFormat)
		resp.ActivatedAt = &at
	}
	writeJSON(w, http.StatusOK, resp)
}

// UseAmeluNameservers moves an existing domain onto Amelu nameservers. For a
// domain already there it puts the mail records back, which repairs a zone
// where someone removed one.
func (a *App) UseAmeluNameservers(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	if a.AmeluDNS == nil {
		writeError(w, http.StatusServiceUnavailable, "Amelu nameservers aren't available yet")
		return
	}
	domain, ok := a.loadOrgDomain(w, r, customer)
	if !ok {
		return
	}
	if err := a.hostDomainDNS(r.Context(), domain); err != nil {
		writeUpstreamError(w, "could not set up Amelu nameservers", err)
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"domain.nameservers_amelu", "domain", domain.ID, domain.Name, nil, requestIP(r))
	a.GetDomainNameservers(w, r)
}

// hostDomainDNS makes sure Amelu hosts the domain's zone: it creates the
// zone on the Amelu nameservers when there is none, copies the records the
// domain answers with today, and writes the mail records.
func (a *App) hostDomainDNS(ctx context.Context, domain *db.Domain) error {
	zone, err := a.Store.GetDNSZone(ctx, domain.ID)
	if errors.Is(err, db.ErrNotFound) {
		created, err := a.AmeluDNS.CreateZone(ctx, domain.Name)
		if err != nil {
			var cfErr *cfdns.Error
			if errors.As(err, &cfErr) && cfErr.Has(1061) {
				return fmt.Errorf("%s is already hosted elsewhere on our DNS provider; remove it there first", domain.Name)
			}
			return err
		}
		if err := a.Store.CreateDNSZone(ctx, domain.ID, created.ID, a.AmeluDNS.ZoneNameservers(created)); err != nil {
			_ = a.AmeluDNS.DeleteZone(ctx, created.ID)
			return err
		}
		// Best effort: a domain with nothing published yet has nothing to copy.
		if err := a.AmeluDNS.ImportExisting(ctx, created.ID); err != nil {
			log.Printf("import existing records for %s: %v", domain.Name, err)
		}
		a.Store.LogActivity(ctx, domain.ID, "domain.nameservers_amelu", "Zone created on Amelu nameservers")
		zone, err = a.Store.GetDNSZone(ctx, domain.ID)
		if err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	return a.applyMailRecords(ctx, domain, zone.ZoneID)
}

// mailRecords are the records Stalwart wants for the domain, in Cloudflare's
// shape, plus the optional Outlook autodiscover record.
func (a *App) mailRecords(ctx context.Context, domain *db.Domain) ([]cfdns.Record, error) {
	sd, err := a.Stalwart.GetDomain(ctx, domain.Name)
	if err != nil {
		return nil, err
	}
	var out []cfdns.Record
	for _, rec := range stalwart.ParseZoneFile(stalwart.UseAmeluSPF(stalwart.FilterTLSIncompatibleRecords(sd.DNSZoneFile))) {
		cf, ok := toCloudflareRecord(rec)
		if ok {
			out = append(out, cf)
		}
	}
	out = append(out, cfdns.Record{
		Type: "SRV", Name: "_autodiscover._tcp." + domain.Name, TTL: 3600,
		Data: map[string]any{"priority": 0, "weight": 0, "port": 443, "target": "autodiscover.amelu.org"},
	})
	for i := range out {
		out[i].Comment = managedComment
	}
	return out, nil
}

func toCloudflareRecord(rec stalwart.ZoneRecord) (cfdns.Record, bool) {
	name := strings.TrimSuffix(rec.Name, ".")
	content := strings.TrimSuffix(rec.Content, ".")
	out := cfdns.Record{Type: rec.Type, Name: name, TTL: 3600}
	switch rec.Type {
	case "MX":
		out.Content, out.Priority = content, rec.Priority
	case "TXT":
		out.Content = rec.Content
	case "CNAME", "A", "AAAA":
		out.Content = content
	case "SRV":
		// "<priority> <weight> <port> <target>"
		f := strings.Fields(rec.Content)
		if len(f) != 4 {
			return out, false
		}
		prio, _ := strconv.Atoi(f[0])
		weight, _ := strconv.Atoi(f[1])
		port, _ := strconv.Atoi(f[2])
		out.Data = map[string]any{"priority": prio, "weight": weight, "port": port, "target": strings.TrimSuffix(f[3], ".")}
	case "TLSA":
		f := strings.Fields(rec.Content)
		if len(f) != 4 {
			return out, false
		}
		usage, _ := strconv.Atoi(f[0])
		selector, _ := strconv.Atoi(f[1])
		mtype, _ := strconv.Atoi(f[2])
		out.Data = map[string]any{"usage": usage, "selector": selector, "matching_type": mtype, "certificate": f[3]}
	default:
		return out, false
	}
	return out, true
}

// applyMailRecords writes the mail records into the zone. Records that
// would compete with them (another MX, a second SPF, an old DMARC or a
// record on the same name and type) are removed first, because two
// answers for those break mail.
func (a *App) applyMailRecords(ctx context.Context, domain *db.Domain, zoneID string) error {
	want, err := a.mailRecords(ctx, domain)
	if err != nil {
		return err
	}
	have, err := a.AmeluDNS.ListRecords(ctx, zoneID)
	if err != nil {
		return err
	}
	clashes := func(h cfdns.Record) bool {
		for _, w := range want {
			if !strings.EqualFold(h.Name, w.Name) || h.Type != w.Type {
				continue
			}
			switch h.Type {
			case "TXT":
				// Only one SPF and one DMARC may exist; other TXT records on the
				// apex (site verifications) stay.
				if isSPF(w.Content) && isSPF(h.Content) {
					return true
				}
				if strings.HasPrefix(w.Content, "v=DMARC1") || strings.Contains(w.Name, "._domainkey.") || strings.HasPrefix(w.Name, "_") {
					return true
				}
			default:
				return true
			}
		}
		return false
	}
	for _, h := range have {
		if h.Comment == managedComment || clashes(h) {
			if err := a.AmeluDNS.DeleteRecord(ctx, zoneID, h.ID); err != nil {
				return fmt.Errorf("remove %s %s: %w", h.Type, h.Name, err)
			}
		}
	}
	for _, rec := range want {
		if _, err := a.AmeluDNS.CreateRecord(ctx, zoneID, rec); err != nil {
			return fmt.Errorf("add %s %s: %w", rec.Type, rec.Name, err)
		}
	}
	return nil
}

func isSPF(v string) bool { return strings.HasPrefix(strings.Trim(v, `"`), "v=spf1") }

// --- records the customer manages ---

type zoneRecordResponse struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Content  string `json:"content"`
	TTL      int    `json:"ttl"`
	Priority *int   `json:"priority,omitempty"`
	Managed  bool   `json:"managed"`
}

func toZoneRecordResponse(rec cfdns.Record) zoneRecordResponse {
	content := rec.Content
	if rec.Type == "SRV" && rec.Data != nil {
		content = fmt.Sprintf("%v %v %v %v", rec.Data["priority"], rec.Data["weight"], rec.Data["port"], rec.Data["target"])
	}
	return zoneRecordResponse{ID: rec.ID, Type: rec.Type, Name: rec.Name, Content: content, TTL: rec.TTL, Priority: rec.Priority, Managed: rec.Comment == managedComment}
}

// hostedZone loads the domain and its Amelu zone, answering for itself when
// either is missing.
func (a *App) hostedZone(w http.ResponseWriter, r *http.Request, customer *db.Customer) (*db.Domain, *db.DNSZone, bool) {
	domain, ok := a.loadOrgDomain(w, r, customer)
	if !ok {
		return nil, nil, false
	}
	if a.AmeluDNS == nil {
		writeError(w, http.StatusServiceUnavailable, "Amelu nameservers aren't available")
		return nil, nil, false
	}
	zone, err := a.Store.GetDNSZone(r.Context(), domain.ID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "this domain keeps its own DNS, so its records are managed where its nameservers point")
		return nil, nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load the zone")
		return nil, nil, false
	}
	return domain, zone, true
}

func (a *App) ListZoneRecords(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	_, zone, ok := a.hostedZone(w, r, customer)
	if !ok {
		return
	}
	recs, err := a.AmeluDNS.ListRecords(r.Context(), zone.ZoneID)
	if err != nil {
		writeUpstreamError(w, "could not load DNS records", err)
		return
	}
	out := make([]zoneRecordResponse, 0, len(recs))
	for _, rec := range recs {
		out = append(out, toZoneRecordResponse(rec))
	}
	writeJSON(w, http.StatusOK, out)
}

type zoneRecordRequest struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Content  string `json:"content"`
	TTL      int    `json:"ttl"`
	Priority *int   `json:"priority"`
}

var editableTypes = map[string]bool{"A": true, "AAAA": true, "CNAME": true, "TXT": true, "MX": true, "CAA": true, "SRV": true, "NS": true}

// toRecord validates a customer's record. Name may be "@", a label or a full
// name inside the domain.
func (req zoneRecordRequest) toRecord(domain string) (cfdns.Record, error) {
	t := strings.ToUpper(strings.TrimSpace(req.Type))
	if !editableTypes[t] {
		return cfdns.Record{}, fmt.Errorf("record type %q isn't supported", req.Type)
	}
	name := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(req.Name), "."))
	switch {
	case name == "" || name == "@":
		name = domain
	case name == domain || strings.HasSuffix(name, "."+domain):
	default:
		name = name + "." + domain
	}
	if t == "NS" && name == domain {
		return cfdns.Record{}, errors.New("the domain's own nameservers are set by Amelu")
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		return cfdns.Record{}, errors.New("a value is required")
	}
	ttl := req.TTL
	if ttl == 0 {
		ttl = 1 // automatic
	}
	rec := cfdns.Record{Type: t, Name: name, Content: content, TTL: ttl}
	switch t {
	case "MX":
		prio := 10
		if req.Priority != nil {
			prio = *req.Priority
		}
		rec.Priority = &prio
	case "SRV":
		f := strings.Fields(content)
		if len(f) != 4 {
			return cfdns.Record{}, errors.New("an SRV value is priority, weight, port and target, like: 0 5 443 server.example.com")
		}
		var n [3]int
		for i := range 3 {
			v, err := strconv.Atoi(f[i])
			if err != nil {
				return cfdns.Record{}, errors.New("an SRV value is priority, weight, port and target, like: 0 5 443 server.example.com")
			}
			n[i] = v
		}
		rec.Content = ""
		rec.Data = map[string]any{"priority": n[0], "weight": n[1], "port": n[2], "target": strings.TrimSuffix(f[3], ".")}
	case "A", "AAAA", "CNAME":
		off := false
		rec.Proxied = &off
	}
	return rec, nil
}

func (a *App) zoneWriter(w http.ResponseWriter, r *http.Request) (*db.Domain, *db.DNSZone, bool) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return nil, nil, false
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return nil, nil, false
	}
	return a.hostedZone(w, r, customer)
}

func (a *App) CreateZoneRecord(w http.ResponseWriter, r *http.Request) {
	domain, zone, ok := a.zoneWriter(w, r)
	if !ok {
		return
	}
	var req zoneRecordRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rec, err := req.toRecord(domain.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := a.AmeluDNS.CreateRecord(r.Context(), zone.ZoneID, rec)
	if err != nil {
		writeRecordError(w, err)
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "dns.record_created", rec.Type+" "+rec.Name)
	writeJSON(w, http.StatusCreated, toZoneRecordResponse(*created))
}

// managedRecord refuses changes to the records Amelu keeps for mail.
func (a *App) managedRecord(w http.ResponseWriter, r *http.Request, zoneID, recordID string) bool {
	recs, err := a.AmeluDNS.ListRecords(r.Context(), zoneID)
	if err != nil {
		writeUpstreamError(w, "could not load DNS records", err)
		return true
	}
	for _, rec := range recs {
		if rec.ID == recordID {
			if rec.Comment == managedComment {
				writeError(w, http.StatusConflict, "this record keeps your email working, so Amelu manages it")
				return true
			}
			return false
		}
	}
	writeError(w, http.StatusNotFound, "record not found")
	return true
}

func (a *App) UpdateZoneRecord(w http.ResponseWriter, r *http.Request) {
	domain, zone, ok := a.zoneWriter(w, r)
	if !ok {
		return
	}
	id := r.PathValue("recordId")
	if a.managedRecord(w, r, zone.ZoneID, id) {
		return
	}
	var req zoneRecordRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rec, err := req.toRecord(domain.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := a.AmeluDNS.UpdateRecord(r.Context(), zone.ZoneID, id, rec)
	if err != nil {
		writeRecordError(w, err)
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "dns.record_updated", rec.Type+" "+rec.Name)
	writeJSON(w, http.StatusOK, toZoneRecordResponse(*updated))
}

func (a *App) DeleteZoneRecord(w http.ResponseWriter, r *http.Request) {
	domain, zone, ok := a.zoneWriter(w, r)
	if !ok {
		return
	}
	id := r.PathValue("recordId")
	if a.managedRecord(w, r, zone.ZoneID, id) {
		return
	}
	if err := a.AmeluDNS.DeleteRecord(r.Context(), zone.ZoneID, id); err != nil {
		writeUpstreamError(w, "could not delete the record", err)
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "dns.record_deleted", id)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// writeRecordError passes Cloudflare's validation message on, since it's
// usually exactly what's wrong with the value ("content must be a valid
// IPv4 address").
func writeRecordError(w http.ResponseWriter, err error) {
	var cfErr *cfdns.Error
	if errors.As(err, &cfErr) && cfErr.Status == http.StatusBadRequest {
		writeError(w, http.StatusBadRequest, cfErr.Msg)
		return
	}
	writeUpstreamError(w, "could not save the record", err)
}

func (a *App) loadOrgDomain(w http.ResponseWriter, r *http.Request, customer *db.Customer) (*db.Domain, bool) {
	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return nil, false
	}
	return domain, true
}
