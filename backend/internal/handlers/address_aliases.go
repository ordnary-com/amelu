package handlers

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
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
			writeUpstreamError(w, "could not load aliases for "+m.LocalPart+" from mail cluster", err)
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

	owners, err := a.aliasOwners(r.Context(), domain)
	if err != nil {
		writeUpstreamError(w, "could not load the domain's aliases from mail cluster", err)
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

		if owner, taken := owners[localPart]; taken {
			results = append(results, createAddressAliasResult{Destination: destLocalPart, Error: aliasInUse(localPart, owner, domain.Name)})
			continue
		}
		if err := a.Stalwart.AddAccountAlias(r.Context(), mailbox.LocalPart, domain.Name, localPart); err != nil {
			results = append(results, createAddressAliasResult{Destination: destLocalPart, Error: aliasError(err, localPart, domain.Name)})
			continue
		}
		owners[localPart] = mailbox.LocalPart
		results = append(results, createAddressAliasResult{Destination: destLocalPart})
	}

	a.Store.LogActivity(r.Context(), domain.ID, "alias.created", "Created alias "+localPart+"@"+domain.Name)
	writeJSON(w, http.StatusCreated, map[string]any{"results": results})
}

// aliasOwners maps every alias local part on the domain to the local part of
// the mailbox it delivers to. Checking it first gives a readable error
// instead of Stalwart's primaryKeyViolation, and stops the same alias being
// stored twice on one mailbox, which Stalwart allows.
func (a *App) aliasOwners(ctx context.Context, domain *db.Domain) (map[string]string, error) {
	mailboxes, err := a.Store.ListMailboxes(ctx, domain.ID)
	if err != nil {
		return nil, err
	}
	owners := map[string]string{}
	for _, m := range mailboxes {
		aliases, err := a.Stalwart.ListAccountAliases(ctx, m.LocalPart, domain.Name)
		if err != nil {
			return nil, err
		}
		for _, alias := range aliases {
			owners[alias.Name] = m.LocalPart
		}
	}
	return owners, nil
}

func aliasInUse(localPart, owner, domainName string) string {
	return fmt.Sprintf("%s@%s is already an alias of %s@%s", localPart, domainName, owner, domainName)
}

func aliasError(err error, localPart, domainName string) string {
	if errors.Is(err, stalwart.ErrAddressInUse) {
		return localPart + "@" + domainName + " is already in use on this domain"
	}
	return upstreamReason(err)
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
		writeUpstreamError(w, "failed to remove alias in mail cluster", err)
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
			writeUpstreamError(w, "could not load aliases for "+m.LocalPart+" from mail cluster", err)
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
// independently - one failure (no such mailbox, alias already claimed,
// the same alias earlier in the file) doesn't abort the rest.
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

	owners, err := a.aliasOwners(r.Context(), domain)
	if err != nil {
		writeUpstreamError(w, "could not load the domain's aliases from mail cluster", err)
		return
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

		// Also catches the same alias twice in one file, since owners grows as rows succeed.
		if owner, taken := owners[aliasLocalPart]; taken {
			results = append(results, importAliasResult{Alias: aliasLocalPart, Destination: destLocalPart, Error: aliasInUse(aliasLocalPart, owner, domain.Name)})
			continue
		}
		if err := a.Stalwart.AddAccountAlias(r.Context(), mailbox.LocalPart, domain.Name, aliasLocalPart); err != nil {
			results = append(results, importAliasResult{Alias: aliasLocalPart, Destination: destLocalPart, Error: aliasError(err, aliasLocalPart, domain.Name)})
			continue
		}
		owners[aliasLocalPart] = mailbox.LocalPart
		results = append(results, importAliasResult{Alias: aliasLocalPart, Destination: destLocalPart})
	}

	a.Store.LogActivity(r.Context(), domain.ID, "alias.imported", "Imported aliases from CSV")
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}
