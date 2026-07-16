package handlers

import (
	"errors"
	"net/http"
	"strings"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
)

// --- domain aliases (Domain.aliases: other domain names that also route to this domain) ---

type domainAliasResponse struct {
	Name string `json:"name"`
}

func (a *App) ListDomainAliases(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	stalwartDomain, err := a.Stalwart.GetDomain(r.Context(), domain.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not load domain from mail cluster: "+err.Error())
		return
	}

	out := make([]domainAliasResponse, 0, len(stalwartDomain.Aliases))
	for name, enabled := range stalwartDomain.Aliases {
		if enabled {
			out = append(out, domainAliasResponse{Name: name})
		}
	}
	writeJSON(w, http.StatusOK, out)
}

type createDomainAliasRequest struct {
	Name string `json:"name"`
}

func (a *App) CreateDomainAlias(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req createDomainAliasRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	aliasName := strings.ToLower(strings.TrimSpace(req.Name))
	if aliasName == "" {
		writeError(w, http.StatusBadRequest, "alias domain name is required")
		return
	}

	if err := a.Stalwart.AddDomainAlias(r.Context(), domain.Name, aliasName); err != nil {
		writeError(w, http.StatusBadGateway, "failed to add domain alias in mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain_alias.created", "Added domain alias "+aliasName)
	writeJSON(w, http.StatusCreated, domainAliasResponse{Name: aliasName})
}

func (a *App) DeleteDomainAlias(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	aliasName := r.PathValue("alias")

	if err := a.Stalwart.RemoveDomainAlias(r.Context(), domain.Name, aliasName); err != nil {
		writeError(w, http.StatusBadGateway, "failed to remove domain alias in mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain_alias.deleted", "Removed domain alias "+aliasName)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- catch-all recipient ---

type catchAllResponse struct {
	Address string `json:"address,omitempty"`
}

func (a *App) GetCatchAll(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	stalwartDomain, err := a.Stalwart.GetDomain(r.Context(), domain.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not load domain from mail cluster: "+err.Error())
		return
	}
	resp := catchAllResponse{}
	if stalwartDomain.CatchAllAddress != nil {
		resp.Address = *stalwartDomain.CatchAllAddress
	}
	writeJSON(w, http.StatusOK, resp)
}

type updateCatchAllRequest struct {
	Address string `json:"address"`
}

func (a *App) UpdateCatchAll(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req updateCatchAllRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	address := strings.ToLower(strings.TrimSpace(req.Address))

	stalwartDomain, err := a.Stalwart.GetDomain(r.Context(), domain.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not load domain from mail cluster: "+err.Error())
		return
	}
	oldAddress := ""
	if stalwartDomain.CatchAllAddress != nil {
		oldAddress = *stalwartDomain.CatchAllAddress
	}

	if address == "" {
		rewrites, err := a.Store.ListPatternRewrites(r.Context(), domain.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not check pattern rewrites")
			return
		}
		if len(rewrites) > 0 {
			writeError(w, http.StatusConflict, "remove this domain's pattern rewrites before clearing the catch-all recipient")
			return
		}
	}

	if err := a.Stalwart.SetCatchAllAddress(r.Context(), domain.Name, address); err != nil {
		writeError(w, http.StatusBadGateway, "failed to update catch-all in mail cluster: "+err.Error())
		return
	}

	oldLocalPart := strings.TrimSuffix(oldAddress, "@"+domain.Name)
	newLocalPart := strings.TrimSuffix(address, "@"+domain.Name)
	if err := a.syncPatternRewritesAfterCatchallChange(r.Context(), domain, oldLocalPart, newLocalPart); err != nil {
		writeError(w, http.StatusBadGateway, "catch-all updated but pattern rewrites could not be moved: "+err.Error())
		return
	}

	if address == "" {
		a.Store.LogActivity(r.Context(), domain.ID, "catchall.cleared", "Cleared catch-all recipient")
	} else {
		a.Store.LogActivity(r.Context(), domain.ID, "catchall.updated", "Set catch-all recipient to "+address)
	}
	writeJSON(w, http.StatusOK, catchAllResponse{Address: address})
}

// --- deactivate / reactivate domain ---

func (a *App) DeactivateDomain(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	if err := a.Stalwart.SetDomainEnabled(r.Context(), domain.Name, false); err != nil {
		writeError(w, http.StatusBadGateway, "failed to deactivate domain in mail cluster: "+err.Error())
		return
	}
	if err := a.Store.UpdateDomainStatus(r.Context(), domain.ID, "suspended", ""); err != nil {
		writeError(w, http.StatusInternalServerError, "domain deactivated in mail cluster but could not update records")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain.deactivated", "Domain deactivated")
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"domain.deactivated", "domain", domain.ID, domain.Name, nil, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) ReactivateDomain(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	if err := a.Stalwart.SetDomainEnabled(r.Context(), domain.Name, true); err != nil {
		writeError(w, http.StatusBadGateway, "failed to reactivate domain in mail cluster: "+err.Error())
		return
	}
	if err := a.Store.UpdateDomainStatus(r.Context(), domain.ID, "dns_pending", ""); err != nil {
		writeError(w, http.StatusInternalServerError, "domain reactivated in mail cluster but could not update records")
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "domain.reactivated", "Domain reactivated")
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"domain.reactivated", "domain", domain.ID, domain.Name, nil, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// loadOwnedDomain loads a domain by id, verifying it belongs to
// organizationID - any member of the organization can load any of its
// domains, regardless of which specific teammate originally created it.
func (a *App) loadOwnedDomain(w http.ResponseWriter, r *http.Request, organizationID, domainID string) (*db.Domain, bool) {
	domain, err := a.Store.GetDomainForOrganization(r.Context(), organizationID, domainID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return nil, false
	}
	return domain, true
}
