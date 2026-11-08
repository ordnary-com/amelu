package handlers

import (
	"errors"
	"net/http"
	"strings"

	"amelu/backend/internal/db"
	"amelu/backend/internal/sieve"
)

type mailboxFilterResponse struct {
	ID     string `json:"id"`
	Field  string `json:"field"`
	Match  string `json:"match"`
	Value  string `json:"value"`
	Action string `json:"action"`
	Target string `json:"target"`
	Stop   bool   `json:"stop"`
}

func toMailboxFilterResponse(f db.MailboxFilter) mailboxFilterResponse {
	return mailboxFilterResponse{ID: f.ID, Field: f.Field, Match: f.Match, Value: f.Value, Action: f.Action, Target: f.Target, Stop: f.Stop}
}

func toSieveFilters(filters []db.MailboxFilter) []sieve.Filter {
	out := make([]sieve.Filter, len(filters))
	for i, f := range filters {
		out[i] = sieve.Filter{Field: f.Field, Match: f.Match, Value: f.Value, Action: f.Action, Target: f.Target, Stop: f.Stop}
	}
	return out
}

type mailboxFilterRequest struct {
	Field  string `json:"field"`
	Match  string `json:"match"`
	Value  string `json:"value"`
	Action string `json:"action"`
	Target string `json:"target"`
	Stop   bool   `json:"stop"`
}

// filter checks the request by compiling it alone, so a bad filter is
// refused with the generator's own message before anything is stored.
func (req mailboxFilterRequest) filter(mailboxID string) (db.MailboxFilter, error) {
	f := db.MailboxFilter{
		MailboxID: mailboxID,
		Field:     strings.TrimSpace(req.Field),
		Match:     strings.TrimSpace(req.Match),
		Value:     strings.TrimSpace(req.Value),
		Action:    strings.TrimSpace(req.Action),
		Target:    strings.TrimSpace(req.Target),
		Stop:      req.Stop,
	}
	if f.Action != "move" && f.Action != "forward" {
		f.Target = ""
	}
	if f.Action == "forward" {
		f.Target = strings.ToLower(f.Target)
	}
	script, err := sieve.GenerateFilterScript(toSieveFilters([]db.MailboxFilter{f}))
	if err != nil {
		return f, errors.New(strings.TrimPrefix(err.Error(), "filter 1: "))
	}
	if _, err := sieve.Validate(script); err != nil {
		return f, err
	}
	return f, nil
}

// ListMailboxFilters -> GET /api/mailboxes/{id}/filters
func (a *App) ListMailboxFilters(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	mailbox, _, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	filters, err := a.Store.ListMailboxFilters(r.Context(), mailbox.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list filters")
		return
	}
	out := make([]mailboxFilterResponse, 0, len(filters))
	for _, f := range filters {
		out = append(out, toMailboxFilterResponse(f))
	}
	writeJSON(w, http.StatusOK, out)
}

// CreateMailboxFilter -> POST /api/mailboxes/{id}/filters. The filter goes
// live when the mailbox's script is redeployed; if that fails it's removed
// again, the same way forwards are.
func (a *App) CreateMailboxFilter(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	var req mailboxFilterRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	f, err := req.filter(mailbox.ID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := a.Store.CreateMailboxFilter(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save filter")
		return
	}
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		a.Store.DeleteMailboxFilter(r.Context(), mailbox.ID, created.ID)
		writeUpstreamError(w, "could not deploy the filter to the mail cluster", err)
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.filter_created", "Added a filter to "+mailbox.LocalPart+"@"+domain.Name)
	writeJSON(w, http.StatusCreated, toMailboxFilterResponse(*created))
}

// UpdateMailboxFilter -> PUT /api/mailboxes/{id}/filters/{filterId}
func (a *App) UpdateMailboxFilter(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	var req mailboxFilterRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	f, err := req.filter(mailbox.ID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	f.ID = r.PathValue("filterId")
	updated, err := a.Store.UpdateMailboxFilter(r.Context(), f)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "filter not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save filter")
		return
	}
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		writeUpstreamError(w, "filter saved but could not update the mail cluster", err)
		return
	}
	writeJSON(w, http.StatusOK, toMailboxFilterResponse(*updated))
}

// DeleteMailboxFilter -> DELETE /api/mailboxes/{id}/filters/{filterId}
func (a *App) DeleteMailboxFilter(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	if err := a.Store.DeleteMailboxFilter(r.Context(), mailbox.ID, r.PathValue("filterId")); errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "filter not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete filter")
		return
	}
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		writeUpstreamError(w, "filter deleted but could not update the mail cluster", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ReorderMailboxFilters -> PUT /api/mailboxes/{id}/filters/order with the
// filter ids in their new order.
func (a *App) ReorderMailboxFilters(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil || len(req.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "ids is required")
		return
	}
	if err := a.Store.ReorderMailboxFilters(r.Context(), mailbox.ID, req.IDs); err != nil {
		writeError(w, http.StatusInternalServerError, "could not reorder filters")
		return
	}
	if err := a.deployDomainWideRulesToMailbox(r.Context(), domain, mailbox.LocalPart); err != nil {
		writeUpstreamError(w, "order saved but could not update the mail cluster", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
