package handlers

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

// Domain status: whatever we did to a domain that stops it from working
// normally, for the dashboard's Domain status page. The sender guard on
// marduk pauses sending by disabling emailSend in Stalwart, which Amelu's
// own mailboxes.may_send never shows; it reports each pause here
// (POST /internal/jobs/domain-actions), and the page checks Stalwart live, so
// a pause lifted by hand or a report that never arrived still shows right.

var domainActionKinds = map[string]bool{"sending_paused": true, "notice": true}
var domainActionSources = map[string]bool{"sender_guard": true, "staff": true}

const domainActionHistory = 20

type domainActionJobRequest struct {
	Domain string `json:"domain"`
	Kind   string `json:"kind"`
	Reason string `json:"reason"`
	// RFC 3339; empty means now.
	At     string `json:"at"`
	Lifted bool   `json:"lifted"`
	// Defaults to sender_guard, the only automatic caller.
	Source string `json:"source"`
	// Who lifted it; defaults to staff.
	LiftedBy string `json:"liftedBy"`
}

// DomainActionJob -> POST /internal/jobs/domain-actions (auth.RequireInternal
// with SENDING_STATS_SECRET). Records an action, or with lifted marks the
// open one of that kind lifted. Both are idempotent, so a retried report
// changes nothing.
func (a *App) DomainActionJob(w http.ResponseWriter, r *http.Request) {
	var req domainActionJobRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Domain) == "" {
		writeError(w, http.StatusBadRequest, "domain is required")
		return
	}
	if !domainActionKinds[req.Kind] {
		writeError(w, http.StatusBadRequest, "kind must be sending_paused or notice")
		return
	}
	if req.Source == "" {
		req.Source = "sender_guard"
	}
	if !domainActionSources[req.Source] {
		writeError(w, http.StatusBadRequest, "source must be sender_guard or staff")
		return
	}
	at := time.Now().UTC()
	if req.At != "" {
		t, err := time.Parse(time.RFC3339, req.At)
		if err != nil {
			writeError(w, http.StatusBadRequest, "at must be an RFC 3339 time")
			return
		}
		at = t.UTC()
	}
	domainID, err := a.Store.GetVerifiedDomainIDByName(r.Context(), strings.TrimSpace(req.Domain))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}

	if req.Lifted {
		by := req.LiftedBy
		if by == "" {
			by = "staff"
		}
		lifted, err := a.Store.LiftDomainAction(r.Context(), domainID, req.Kind, by, at)
		if err != nil {
			log.Printf("domain actions: lift %s for %s: %v", req.Kind, req.Domain, err)
			writeError(w, http.StatusInternalServerError, "could not lift domain action")
			return
		}
		status := "lifted"
		if !lifted {
			status = "not_open"
		} else if req.Kind == "sending_paused" {
			a.noteSendingRestored(r.Context(), domainID)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": status})
		return
	}
	created, err := a.Store.RecordDomainAction(r.Context(), domainID, req.Kind, req.Reason, req.Source, at)
	if err != nil {
		log.Printf("domain actions: record %s for %s: %v", req.Kind, req.Domain, err)
		writeError(w, http.StatusInternalServerError, "could not record domain action")
		return
	}
	status := "recorded"
	if !created {
		status = "already_open"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

type domainStatusResponse struct {
	Domain struct {
		Name   string `json:"name"`
		Status string `json:"status"`
	} `json:"domain"`
	Sending      domainSendingStatus    `json:"sending"`
	Account      domainAccountStatus    `json:"account"`
	DailyLimit   domainSendingResponse  `json:"dailyLimit"`
	DedicatedIPs []dedicatedIPResponse  `json:"dedicatedIps"`
	Actions      []domainActionResponse `json:"actions"`
	// The domain's sending review ticket that isn't closed, or null.
	Review *sendingReviewResponse `json:"review"`
	// Something on this page needs the customer's attention; drives the sidebar dot.
	Attention bool `json:"attention"`
}

type domainSendingStatus struct {
	// ok, paused, or unknown when Stalwart couldn't be read.
	State string `json:"state"`
	// Addresses that can't send right now.
	PausedMailboxes []string `json:"pausedMailboxes"`
	// From the open pause; null when the pause was never reported.
	Since  *time.Time `json:"since"`
	Reason *string    `json:"reason"`
}

type domainAccountStatus struct {
	Suspended bool   `json:"suspended"`
	Message   string `json:"message,omitempty"`
}

type domainActionResponse struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	Reason    string     `json:"reason"`
	Source    string     `json:"source"`
	CreatedAt time.Time  `json:"createdAt"`
	LiftedAt  *time.Time `json:"liftedAt"`
	Active    bool       `json:"active"`
}

const accountSuspendedMessage = "The account that owns this domain has been suspended. Email abuse@amelu.org from another address to sort it out."

// GetDomainStatus -> GET /api/domains/{id}/status
func (a *App) GetDomainStatus(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	ctx := r.Context()

	out := domainStatusResponse{DedicatedIPs: []dedicatedIPResponse{}, Actions: []domainActionResponse{}}
	out.Domain.Name, out.Domain.Status = domain.Name, domain.Status
	out.Sending = domainSendingStatus{State: "unknown", PausedMailboxes: []string{}}

	paused, err := a.pausedMailboxes(ctx, domain)
	if err != nil {
		log.Printf("domain status: read send permissions of %s: %v", domain.Name, err)
	}
	open, err := a.Store.OpenDomainAction(ctx, domain.ID, "sending_paused")
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not load domain status")
		return
	}
	switch {
	case paused == nil:
	case len(paused) == 0:
		out.Sending.State = "ok"
		if open != nil {
			// Lifted by hand on marduk without telling us: the history catches up here.
			if lifted, err := a.Store.LiftDomainAction(ctx, domain.ID, "sending_paused", "detected", time.Now().UTC()); err != nil {
				log.Printf("domain status: lift stale pause of %s: %v", domain.Name, err)
			} else if lifted {
				a.noteSendingRestored(ctx, domain.ID)
			}
		}
	default:
		out.Sending.State = "paused"
		for _, name := range paused {
			out.Sending.PausedMailboxes = append(out.Sending.PausedMailboxes, name+"@"+domain.Name)
		}
		if open != nil {
			since, reason := open.CreatedAt.UTC(), customerReason(open.Source, open.Reason)
			out.Sending.Since, out.Sending.Reason = &since, &reason
		}
	}

	suspended, err := a.Store.CustomerSuspended(ctx, domain.CustomerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain status")
		return
	}
	out.Account.Suspended = suspended
	if suspended {
		out.Account.Message = accountSuspendedMessage
	}

	if out.DailyLimit, err = a.domainSendingUsage(ctx, customer.OrganizationID.String, domain.Name); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load sending stats")
		return
	}

	ips, err := a.Store.ListDedicatedIPsForOrganization(ctx, customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dedicated IPs")
		return
	}
	if len(ips) > 0 {
		states := a.dedicatedIPStates(r)
		for _, d := range ips {
			out.DedicatedIPs = append(out.DedicatedIPs, toDedicatedIPResponse(d, states, false))
		}
	}

	if review, err := a.Store.OpenSendingReview(ctx, domain.ID); err == nil {
		out.Review = toSendingReviewResponse(review)
	} else if !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not load domain status")
		return
	}

	actions, err := a.Store.ListDomainActions(ctx, domain.ID, domainActionHistory)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain status")
		return
	}
	for _, act := range actions {
		resp := domainActionResponse{
			ID: act.ID, Kind: act.Kind, Reason: customerReason(act.Source, act.Reason), Source: act.Source,
			CreatedAt: act.CreatedAt.UTC(), Active: !act.LiftedAt.Valid,
		}
		if act.LiftedAt.Valid {
			lifted := act.LiftedAt.Time.UTC()
			resp.LiftedAt = &lifted
		}
		out.Actions = append(out.Actions, resp)
	}

	out.Attention = out.Sending.State == "paused" || suspended || domain.Status == "suspended" || domain.Status == "failed"
	writeJSON(w, http.StatusOK, out)
}

// pausedMailboxes returns the local parts on the domain that Stalwart won't
// let send although the customer never turned sending off for them, sorted;
// nil when Stalwart couldn't be read.
func (a *App) pausedMailboxes(ctx context.Context, domain *db.Domain) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	states, err := a.Stalwart.DomainSendStates(ctx, domain.Name)
	if err != nil {
		return nil, err
	}
	mailboxes, err := a.Store.ListMailboxes(ctx, domain.ID)
	if err != nil {
		return nil, err
	}
	return sendPaused(states, mailboxes), nil
}

// sendPaused picks the accounts with emailSend disabled, minus mailboxes
// whose owner switched sending off under Enabled Services (may_send false),
// which Stalwart stores the same way. The result is never nil: nil means
// "couldn't read" to pausedMailboxes' caller.
func sendPaused(states []stalwart.AccountSendState, mailboxes []db.Mailbox) []string {
	ownChoice := map[string]bool{}
	for _, m := range mailboxes {
		if !m.MaySend {
			ownChoice[strings.ToLower(m.LocalPart)] = true
		}
	}
	out := []string{}
	for _, s := range states {
		if s.SendDisabled && !ownChoice[strings.ToLower(s.Name)] {
			out = append(out, s.Name)
		}
	}
	sort.Strings(out)
	return out
}

// customerReason turns the sender guard's reasons ("8 recipients that don't
// exist; 41 recipient domains") into plain sentences without the counts, so
// the page doesn't read as a guide to staying under the guard's thresholds.
// Staff write their reasons for the customer already.
func customerReason(source, reason string) string {
	if source != "sender_guard" {
		return reason
	}
	var out []string
	seen := map[string]bool{}
	for _, part := range strings.Split(reason, ";") {
		var s string
		switch part = strings.ToLower(part); {
		case strings.Contains(part, "don't exist"):
			s = "Many messages went to addresses that don't exist."
		case strings.Contains(part, "recipient domains"):
			s = "Messages went to an unusually large number of different domains in a short time."
		case strings.Contains(part, "policy or spam"):
			s = "Receiving servers refused messages as spam or against their policy."
		case strings.Contains(part, "unsolicited"):
			s = "Gmail refused messages as unsolicited mail."
		default:
			continue
		}
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return "Mail from this domain looked like cold outreach or bulk mail to a list."
	}
	return strings.Join(out, " ")
}
