package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
)

// Sending review requests: when sending is paused on a domain, its owner asks
// for a review from the Domain status page. That opens a support ticket of
// its own kind (category sending_review, migration 0053) whose first message
// is the pause plus the customer's answers; staff answer and lift the pause
// on marduk, and the lift adds a system message to the ticket.

const (
	sendingReviewTextMax  = 2000
	sendingReviewShortMax = 1000
)

var (
	sendingReviewCollection = map[string]string{
		"customers": "Our own customers or contacts who asked to hear from us",
		"signups":   "Sign-ups on our website",
		"purchased": "A purchased or scraped list",
		"other":     "Something else",
	}
	sendingReviewVolumes = map[string]string{
		"lt100":  "fewer than 100 messages a day",
		"100-1k": "100 to 1,000 messages a day",
		"1k-10k": "1,000 to 10,000 messages a day",
		"gt10k":  "more than 10,000 messages a day",
	}
)

func sendingReviewReceived(domain string) string {
	return fmt.Sprintf("We've received your request to review sending for %s. Our team looks at it by hand and replies in this ticket. Sending stays paused while we review it.", domain)
}

func sendingRestored(domain string) string {
	return fmt.Sprintf("Sending was restored for %s. Its mailboxes can send mail again.", domain)
}

type sendingReviewResponse struct {
	TicketID string `json:"ticketId"`
	Number   int64  `json:"number"`
	Status   string `json:"status"`
	// POST only: the domain already had an open review, so no new ticket was opened.
	Existing bool `json:"existing,omitempty"`
}

func toSendingReviewResponse(r *db.SendingReview) *sendingReviewResponse {
	return &sendingReviewResponse{TicketID: r.TicketID, Number: r.Number, Status: r.Status}
}

type createSendingReviewRequest struct {
	// What they send, and to whom.
	Sends      string `json:"sends"`
	Recipients string `json:"recipients"`
	// How the addresses were collected; the detail is required for "other".
	Collection       string `json:"collection"`
	CollectionDetail string `json:"collectionDetail"`
	Volume           string `json:"volume"`
	Changes          string `json:"changes"`
	AcceptPolicy     bool   `json:"acceptPolicy"`
}

// CreateSendingReview -> POST /api/domains/{id}/status/review-request: opens
// the review ticket, or returns the domain's open one (200, existing true).
// Only while sending is paused; owners and admins, like other domain changes.
func (a *App) CreateSendingReview(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "only owners and admins can request a review")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	ctx := r.Context()

	if open, err := a.Store.OpenSendingReview(ctx, domain.ID); err == nil {
		resp := toSendingReviewResponse(open)
		resp.Existing = true
		writeJSON(w, http.StatusOK, resp)
		return
	} else if !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not send the request")
		return
	}

	var req createSendingReviewRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	sends, recipients := strings.TrimSpace(req.Sends), strings.TrimSpace(req.Recipients)
	detail, changes := strings.TrimSpace(req.CollectionDetail), strings.TrimSpace(req.Changes)
	collection, ok1 := sendingReviewCollection[req.Collection]
	volume, ok2 := sendingReviewVolumes[req.Volume]
	switch {
	case sends == "" || recipients == "" || changes == "":
		writeError(w, http.StatusBadRequest, "tell us what you send, who receives it and what you changed")
		return
	case !ok1:
		writeError(w, http.StatusBadRequest, "choose how you collected the addresses")
		return
	case req.Collection == "other" && detail == "":
		writeError(w, http.StatusBadRequest, "tell us how you collected the addresses")
		return
	case !ok2:
		writeError(w, http.StatusBadRequest, "choose how much mail you send a day")
		return
	case len(sends) > sendingReviewTextMax || len(changes) > sendingReviewTextMax ||
		len(recipients) > sendingReviewShortMax || len(detail) > sendingReviewShortMax:
		writeError(w, http.StatusBadRequest, "one of your answers is too long")
		return
	case !req.AcceptPolicy:
		writeError(w, http.StatusBadRequest, "confirm that you've read the Acceptable Use Policy")
		return
	}

	paused, err := a.pausedMailboxes(ctx, domain)
	if err != nil {
		log.Printf("sending review: read send permissions of %s: %v", domain.Name, err)
		writeError(w, http.StatusServiceUnavailable, "we couldn't reach the mail server to check this domain; try again in a minute")
		return
	}
	if len(paused) == 0 {
		writeError(w, http.StatusConflict, "sending isn't paused on this domain")
		return
	}
	pause, err := a.Store.OpenDomainAction(ctx, domain.ID, "sending_paused")
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "could not send the request")
		return
	}

	since, reason := "not recorded", "not recorded"
	if pause != nil {
		since = pause.CreatedAt.UTC().Format("2 Jan 2006, 15:04 UTC")
		reason = customerReason(pause.Source, pause.Reason)
	}
	addresses := make([]string, len(paused))
	for i, name := range paused {
		addresses[i] = name + "@" + domain.Name
	}
	var body strings.Builder
	fmt.Fprintf(&body, "Please review sending for %s.\n\n", domain.Name)
	fmt.Fprintf(&body, "Domain: %s\nPaused since: %s\nReason: %s\nPaused mailboxes: %s\n\n", domain.Name, since, reason, strings.Join(addresses, ", "))
	fmt.Fprintf(&body, "What we send:\n%s\n\nWho receives it:\n%s\n\n", sends, recipients)
	fmt.Fprintf(&body, "How we collected the addresses: %s\n", collection)
	if detail != "" {
		body.WriteString(detail + "\n")
	}
	fmt.Fprintf(&body, "\nVolume: %s\n\nWhat we changed:\n%s\n\n", volume, changes)
	body.WriteString("We've read the Acceptable Use Policy (https://amelu.org/acceptable-use) and won't send unsolicited bulk mail.")

	review, created, err := a.Store.CreateSendingReview(ctx, customer.OrganizationID.String, domain.ID, customer.ID, supportAuthorName(customer),
		"Sending review for "+domain.Name, body.String(), sendingReviewReceived(domain.Name))
	if err != nil {
		log.Printf("sending review: create for %s: %v", domain.Name, err)
		writeError(w, http.StatusInternalServerError, "could not send the request")
		return
	}
	resp := toSendingReviewResponse(review)
	if !created {
		resp.Existing = true
		writeJSON(w, http.StatusOK, resp)
		return
	}
	a.Store.LogOrganizationAudit(ctx, customer.OrganizationID.String, &customer.ID, customer.Email,
		"domain.sending_review_requested", "domain", domain.ID, domain.Name, nil, requestIP(r))
	if t, err := a.Store.GetSupportTicket(ctx, review.TicketID); err == nil {
		a.notifySupport(t, "Sending review", body.String())
	}
	writeJSON(w, http.StatusCreated, resp)
}

// noteSendingRestored tells the domain's open review tickets that its pause
// was lifted. Best effort: the lift itself already happened.
func (a *App) noteSendingRestored(ctx context.Context, domainID string) {
	ids, err := a.Store.OpenSendingReviewTicketIDs(ctx, domainID)
	if err != nil {
		log.Printf("sending review: find open reviews of domain %s: %v", domainID, err)
		return
	}
	for _, id := range ids {
		t, err := a.Store.GetSupportTicket(ctx, id)
		if err != nil {
			log.Printf("sending review: load ticket %s: %v", id, err)
			continue
		}
		message := sendingRestored(t.DomainName.String)
		// The status stays: a note isn't a reply, and staff close the review.
		if _, err := a.Store.AddSupportMessage(ctx, id, "system", nil, "Amelu", message, false, t.Status); err != nil {
			log.Printf("sending review: note lift on ticket %s: %v", id, err)
			continue
		}
		a.notifyCustomerOfReply(t, message, false)
	}
}
