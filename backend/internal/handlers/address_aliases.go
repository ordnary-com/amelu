package handlers

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
)

// addressAliasResponse is one alias->mailbox pairing. Stalwart enforces
// each alias address as globally unique per domain, so unlike Migadu one
// alias can only ever resolve to a single mailbox here - see
// CreateAddressAlias for what that means for multi-destination requests.
type addressAliasResponse struct {
	Address              string `json:"address"`
	DestinationMailbox   string `json:"destinationMailbox"`
	DestinationMailboxID string `json:"destinationMailboxId"`
	Index                string `json:"index"`
}

// ListAddressAliases aggregates every alias across every mailbox in the
// domain, since Stalwart has no single "list all aliases for this domain"
// call - aliases live on the accounts that receive them.
func (a *App) ListAddressAliases(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	mailboxes, err := a.Store.ListMailboxes(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list mailboxes")
		return
	}

	out := []addressAliasResponse{}
	for _, m := range mailboxes {
		aliases, err := a.Stalwart.ListAccountAliases(r.Context(), m.LocalPart, domain.Name)
		if err != nil {
			writeError(w, http.StatusBadGateway, "could not load aliases for "+m.LocalPart+" from mail cluster: "+err.Error())
			return
		}
		for _, alias := range aliases {
			out = append(out, addressAliasResponse{
				Address:              alias.Name + "@" + domain.Name,
				DestinationMailbox:   m.LocalPart + "@" + domain.Name,
				DestinationMailboxID: m.ID,
				Index:                alias.Index,
			})
		}
	}
	if out == nil {
		out = []addressAliasResponse{}
	}
	writeJSON(w, http.StatusOK, out)
}

type createAddressAliasRequest struct {
	LocalPart    string   `json:"localPart"`
	Destinations []string `json:"destinations"`
}

type createAddressAliasResult struct {
	Destination string `json:"destination"`
	Error       string `json:"error,omitempty"`
}

// CreateAddressAlias registers localPart@domain as an alias delivering to
// every mailbox named in destinations. Each destination is applied
// independently so a bad one (no such mailbox) doesn't block the rest -
// but since Stalwart requires the alias address to be globally unique per
// domain, only the first destination actually succeeds; every destination
// after that comes back with an explicit error in the response so the
// caller can surface "already claimed by another mailbox" instead of
// silently pretending the fan-out worked.
func (a *App) CreateAddressAlias(w http.ResponseWriter, r *http.Request) {
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

	var req createAddressAliasRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	localPart := strings.ToLower(strings.TrimSpace(req.LocalPart))
	if localPart == "" {
		writeError(w, http.StatusBadRequest, "original addressee is required")
		return
	}
	if len(req.Destinations) == 0 {
		writeError(w, http.StatusBadRequest, "at least one destination is required")
		return
	}

	results := make([]createAddressAliasResult, 0, len(req.Destinations))
	for _, dest := range req.Destinations {
		destLocalPart := strings.ToLower(strings.TrimSpace(dest))
		destLocalPart = strings.TrimSuffix(destLocalPart, "@"+domain.Name)
		if destLocalPart == "" {
			continue
		}

		mailbox, err := a.findMailboxByLocalPart(r.Context(), domain.ID, destLocalPart)
		if err != nil {
			results = append(results, createAddressAliasResult{Destination: destLocalPart, Error: "no such mailbox"})
			continue
		}

		if err := a.Stalwart.AddAccountAlias(r.Context(), mailbox.LocalPart, domain.Name, localPart); err != nil {
			results = append(results, createAddressAliasResult{Destination: destLocalPart, Error: err.Error()})
			continue
		}
		results = append(results, createAddressAliasResult{Destination: destLocalPart})
	}

	a.Store.LogActivity(r.Context(), domain.ID, "alias.created", "Created alias "+localPart+"@"+domain.Name)
	writeJSON(w, http.StatusCreated, map[string]any{"results": results})
}

func (a *App) findMailboxByLocalPart(ctx context.Context, domainID, localPart string) (*db.Mailbox, error) {
	mailboxes, err := a.Store.ListMailboxes(ctx, domainID)
	if err != nil {
		return nil, err
	}
	for i := range mailboxes {
		if mailboxes[i].LocalPart == localPart {
			return &mailboxes[i], nil
		}
	}
	return nil, fmt.Errorf("no mailbox %s in domain", localPart)
}

// DeleteAddressAlias removes one alias entry (identified by which mailbox
// it's attached to and its index in that mailbox's aliases list - see
// ListAddressAliases) from Stalwart.
func (a *App) DeleteAddressAlias(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	mailboxID := r.PathValue("mailboxId")
	index := r.PathValue("index")

	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, mailboxID)
	if !ok {
		return
	}

	if err := a.Stalwart.RemoveAccountAlias(r.Context(), mailbox.LocalPart, domain.Name, index); err != nil {
		writeError(w, http.StatusBadGateway, "failed to remove alias in mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "alias.deleted", "Removed an alias from "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ExportAddressAliasesCSV downloads every alias for a domain as CSV, two
// columns and no header row: Alias, Destination. Import expects the same
// shape, so export -> re-import round-trips cleanly.
func (a *App) ExportAddressAliasesCSV(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	mailboxes, err := a.Store.ListMailboxes(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list mailboxes")
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-aliases.csv"`, domain.Name))

	cw := csv.NewWriter(w)
	for _, m := range mailboxes {
		aliases, err := a.Stalwart.ListAccountAliases(r.Context(), m.LocalPart, domain.Name)
		if err != nil {
			writeError(w, http.StatusBadGateway, "could not load aliases for "+m.LocalPart+" from mail cluster: "+err.Error())
			return
		}
		for _, alias := range aliases {
			cw.Write([]string{alias.Name + "@" + domain.Name, m.LocalPart + "@" + domain.Name})
		}
	}
	cw.Flush()
}

type importAliasResult struct {
	Alias       string `json:"alias"`
	Destination string `json:"destination"`
	Error       string `json:"error,omitempty"`
}

// ImportAddressAliasesCSV bulk-creates aliases from CSV with exactly 2
// columns and no header row: Alias, Destination. Each row is applied
// independently - one failure (no such mailbox, alias already claimed)
// doesn't abort the rest.
func (a *App) ImportAddressAliasesCSV(w http.ResponseWriter, r *http.Request) {
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

	var req struct {
		CSV string `json:"csv"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cr := csv.NewReader(strings.NewReader(req.CSV))
	cr.FieldsPerRecord = -1
	rows, err := cr.ReadAll()
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not parse CSV: "+err.Error())
		return
	}

	col := func(row []string, i int) string {
		if i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	var results []importAliasResult
	for _, row := range rows {
		aliasLocalPart := strings.ToLower(col(row, 0))
		aliasLocalPart = strings.TrimSuffix(aliasLocalPart, "@"+domain.Name)
		destLocalPart := strings.ToLower(col(row, 1))
		destLocalPart = strings.TrimSuffix(destLocalPart, "@"+domain.Name)
		if aliasLocalPart == "" || destLocalPart == "" {
			continue
		}

		mailbox, err := a.findMailboxByLocalPart(r.Context(), domain.ID, destLocalPart)
		if err != nil {
			results = append(results, importAliasResult{Alias: aliasLocalPart, Destination: destLocalPart, Error: "no such mailbox"})
			continue
		}

		if err := a.Stalwart.AddAccountAlias(r.Context(), mailbox.LocalPart, domain.Name, aliasLocalPart); err != nil {
			results = append(results, importAliasResult{Alias: aliasLocalPart, Destination: destLocalPart, Error: err.Error()})
			continue
		}
		results = append(results, importAliasResult{Alias: aliasLocalPart, Destination: destLocalPart})
	}

	a.Store.LogActivity(r.Context(), domain.ID, "alias.imported", "Imported aliases from CSV")
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}
