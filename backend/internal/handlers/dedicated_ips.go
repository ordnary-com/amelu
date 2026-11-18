package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"net/netip"
	"regexp"
	"strings"
	"time"

	"amelu/backend/internal/db"
)

// Dedicated IPs: sending IPs from our own block reserved for one
// organization. Staff keep the inventory and assign IPs from Airplane
// (/internal/admin/dedicated-ips); marduk's amelu-ip-pools reads the
// assignments (/internal/jobs/dedicated-ips) and sends the organization's
// domains from its IP; customers see theirs under My Organization. See
// migration 0050.

// Dedicated IPs come from 89.106.70.100-149 in our own block (AS218905):
// .1-.99 are the shared sending addresses, .200/29 is ishtar.
var (
	ownBlock         = netip.MustParsePrefix("89.106.70.0/24")
	dedicatedIPFirst = netip.MustParseAddr("89.106.70.100")
	dedicatedIPLast  = netip.MustParseAddr("89.106.70.149")
)

var hostnamePattern = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`)

type dedicatedIPResponse struct {
	IP         string  `json:"ip"`
	Hostname   string  `json:"hostname"`
	AssignedAt *string `json:"assignedAt"`
	// From marduk's last report: sending, paused or setting_up.
	State string `json:"state"`

	// Admin only.
	OrganizationID   *string `json:"organizationId,omitempty"`
	OrganizationName string  `json:"organizationName,omitempty"`
	Note             string  `json:"note,omitempty"`
	CreatedAt        string  `json:"createdAt,omitempty"`
}

// dedicatedIPStates maps each IP in marduk's last report that it sends as a
// dedicated IP to its state.
func (a *App) dedicatedIPStates(r *http.Request) map[string]string {
	ips, _, err := a.Store.GetSendingNetwork(r.Context())
	if err != nil {
		return nil
	}
	out := map[string]string{}
	for _, ip := range ips {
		if ip.Group != "dedicated" {
			continue
		}
		switch ip.State {
		case "active":
			out[ip.IP] = "sending"
		case "paused":
			out[ip.IP] = "paused"
		}
	}
	return out
}

func toDedicatedIPResponse(d db.DedicatedIP, states map[string]string, admin bool) dedicatedIPResponse {
	resp := dedicatedIPResponse{IP: d.IP, Hostname: d.Hostname, State: "setting_up"}
	if d.OrganizationID.Valid {
		if s, ok := states[d.IP]; ok {
			resp.State = s
		}
	} else {
		resp.State = "available"
	}
	if d.AssignedAt.Valid {
		at := d.AssignedAt.Time.UTC().Format(time.RFC3339)
		resp.AssignedAt = &at
	}
	if admin {
		if d.OrganizationID.Valid {
			resp.OrganizationID = &d.OrganizationID.String
		}
		resp.OrganizationName = d.OrganizationName
		resp.Note = d.Note
		resp.CreatedAt = d.CreatedAt.UTC().Format(time.RFC3339)
	}
	return resp
}

// ListOrganizationDedicatedIPs -> GET /api/organization/dedicated-ips
func (a *App) ListOrganizationDedicatedIPs(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	list, err := a.Store.ListDedicatedIPsForOrganization(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dedicated IPs")
		return
	}
	states := a.dedicatedIPStates(r)
	out := make([]dedicatedIPResponse, 0, len(list))
	for _, d := range list {
		out = append(out, toDedicatedIPResponse(d, states, false))
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminListDedicatedIPs -> GET /internal/admin/dedicated-ips
func (a *App) AdminListDedicatedIPs(w http.ResponseWriter, r *http.Request, operator string) {
	list, err := a.Store.ListDedicatedIPs(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dedicated IPs")
		return
	}
	states := a.dedicatedIPStates(r)
	out := make([]dedicatedIPResponse, 0, len(list))
	for _, d := range list {
		out = append(out, toDedicatedIPResponse(d, states, true))
	}
	writeJSON(w, http.StatusOK, out)
}

type addDedicatedIPRequest struct {
	IP       string `json:"ip"`
	Hostname string `json:"hostname"`
	Note     string `json:"note"`
}

// AdminAddDedicatedIP -> POST /internal/admin/dedicated-ips: an address from
// the dedicated range into the inventory. The hostname defaults to the block's
// naming, out-N.mta0.amelu.org, which already has forward and reverse DNS.
func (a *App) AdminAddDedicatedIP(w http.ResponseWriter, r *http.Request, operator string) {
	var req addDedicatedIPRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	addr, err := netip.ParseAddr(strings.TrimSpace(req.IP))
	if err != nil || !addr.Is4() || !ownBlock.Contains(addr) || addr.Less(dedicatedIPFirst) || dedicatedIPLast.Less(addr) {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("ip must be between %s and %s", dedicatedIPFirst, dedicatedIPLast))
		return
	}
	hostname := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(req.Hostname), "."))
	if hostname == "" {
		hostname = fmt.Sprintf("out-%d.mta0.amelu.org", addr.As4()[3])
	}
	if !hostnamePattern.MatchString(hostname) {
		writeError(w, http.StatusBadRequest, "hostname is not valid")
		return
	}
	note := strings.TrimSpace(req.Note)
	if err := a.Store.AddDedicatedIP(r.Context(), addr.String(), hostname, note); errors.Is(err, db.ErrDedicatedIPExists) {
		writeError(w, http.StatusConflict, "that address or hostname is already in the inventory")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not add dedicated IP")
		return
	}
	a.Store.LogAdminAction(r.Context(), "dedicated_ip", addr.String(), operator, "dedicated_ip.added", hostname)
	d, err := a.Store.GetDedicatedIP(r.Context(), addr.String())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dedicated IP")
		return
	}
	writeJSON(w, http.StatusCreated, toDedicatedIPResponse(*d, nil, true))
}

type updateDedicatedIPRequest struct {
	// An organization id assigns the IP, "" releases it, absent leaves it.
	OrganizationID *string `json:"organizationId,omitempty"`
	Note           *string `json:"note,omitempty"`
}

// AdminUpdateDedicatedIP -> PATCH /internal/admin/dedicated-ips/{ip}
func (a *App) AdminUpdateDedicatedIP(w http.ResponseWriter, r *http.Request, operator string) {
	ip := r.PathValue("ip")
	var req updateDedicatedIPRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if _, err := a.Store.GetDedicatedIP(r.Context(), ip); errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "dedicated IP not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dedicated IP")
		return
	}
	if req.OrganizationID != nil {
		var target *string
		if id := strings.TrimSpace(*req.OrganizationID); id != "" {
			if !uuidPattern.MatchString(id) {
				writeError(w, http.StatusBadRequest, "organization not found")
				return
			}
			org, err := a.Store.GetOrganizationByID(r.Context(), id)
			if err != nil {
				writeError(w, http.StatusBadRequest, "organization not found")
				return
			}
			target = &id
			a.Store.LogAdminAction(r.Context(), "dedicated_ip", ip, operator, "dedicated_ip.assigned", org.Name)
		} else {
			a.Store.LogAdminAction(r.Context(), "dedicated_ip", ip, operator, "dedicated_ip.released", "")
		}
		if err := a.Store.AssignDedicatedIP(r.Context(), ip, target); err != nil {
			writeError(w, http.StatusInternalServerError, "could not assign dedicated IP")
			return
		}
		if target != nil {
			a.finishDedicatedIPRequest(r, *target, ip)
		}
	}
	if req.Note != nil {
		if err := a.Store.UpdateDedicatedIPNote(r.Context(), ip, strings.TrimSpace(*req.Note)); err != nil {
			writeError(w, http.StatusInternalServerError, "could not save the note")
			return
		}
	}
	d, err := a.Store.GetDedicatedIP(r.Context(), ip)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dedicated IP")
		return
	}
	writeJSON(w, http.StatusOK, toDedicatedIPResponse(*d, a.dedicatedIPStates(r), true))
}

// AdminDeleteDedicatedIP -> DELETE /internal/admin/dedicated-ips/{ip}: only
// while it isn't assigned.
func (a *App) AdminDeleteDedicatedIP(w http.ResponseWriter, r *http.Request, operator string) {
	ip := r.PathValue("ip")
	switch err := a.Store.DeleteDedicatedIP(r.Context(), ip); {
	case errors.Is(err, db.ErrNotFound):
		writeError(w, http.StatusNotFound, "dedicated IP not found")
		return
	case errors.Is(err, db.ErrDedicatedIPInUse):
		writeError(w, http.StatusConflict, "release the IP from its organization first")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "could not delete dedicated IP")
		return
	}
	a.Store.LogAdminAction(r.Context(), "dedicated_ip", ip, operator, "dedicated_ip.deleted", "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// DedicatedIPRoutesJob -> GET /internal/jobs/dedicated-ips: for marduk's
// amelu-ip-pools, every assigned IP with the domains to send from it.
func (a *App) DedicatedIPRoutesJob(w http.ResponseWriter, r *http.Request) {
	routes, err := a.Store.DedicatedIPRoutes(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dedicated IPs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ips": routes})
}
