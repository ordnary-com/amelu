package handlers

import (
	"context"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"amelu/backend/internal/db"
)

// Support tickets: customers open and answer them in the dashboard, support
// answers from Airplane's Amelu section (/internal/admin/support). See
// migration 0047.

const (
	supportSubjectMax     = 150
	supportBodyMax        = 20000
	supportOpenTicketsMax = 20
	// What customers see as the author of a staff reply.
	supportStaffName = "Amelu Support"
)

var (
	supportCategories = map[string]bool{"account": true, "domains": true, "delivery": true, "billing": true, "other": true}
	uuidPattern       = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

type supportMessageResponse struct {
	ID         string `json:"id"`
	AuthorKind string `json:"authorKind"`
	AuthorName string `json:"authorName"`
	Body       string `json:"body"`
	Internal   bool   `json:"internal,omitempty"`
	CreatedAt  string `json:"createdAt"`
}

type supportTicketResponse struct {
	ID             string  `json:"id"`
	Number         int64   `json:"number"`
	Subject        string  `json:"subject"`
	Category       string  `json:"category"`
	Status         string  `json:"status"`
	DomainID       *string `json:"domainId"`
	DomainName     *string `json:"domainName"`
	OpenedByName   string  `json:"openedByName"`
	LastAuthorKind string  `json:"lastAuthorKind"`
	MessageCount   int     `json:"messageCount"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
	ClosedAt       *string `json:"closedAt"`

	// Admin only.
	OrganizationID   string  `json:"organizationId,omitempty"`
	OrganizationName string  `json:"organizationName,omitempty"`
	OpenedByEmail    string  `json:"openedByEmail,omitempty"`
	Priority         string  `json:"priority,omitempty"`
	AssignedTo       *string `json:"assignedTo,omitempty"`

	Messages []supportMessageResponse `json:"messages,omitempty"`
}

func toSupportTicketResponse(t *db.SupportTicket, admin bool) supportTicketResponse {
	resp := supportTicketResponse{
		ID: t.ID, Number: t.Number, Subject: t.Subject, Category: t.Category, Status: t.Status,
		OpenedByName: t.OpenedByName, LastAuthorKind: t.LastAuthorKind, MessageCount: t.MessageCount,
		CreatedAt: t.CreatedAt.UTC().Format(time.RFC3339), UpdatedAt: t.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if t.DomainID.Valid {
		resp.DomainID = &t.DomainID.String
	}
	if t.DomainName.Valid {
		resp.DomainName = &t.DomainName.String
	}
	if t.ClosedAt.Valid {
		closed := t.ClosedAt.Time.UTC().Format(time.RFC3339)
		resp.ClosedAt = &closed
	}
	if admin {
		resp.OrganizationID = t.OrganizationID
		resp.OrganizationName = t.OrganizationName
		resp.OpenedByEmail = t.OpenedByEmail
		resp.Priority = t.Priority
		if t.AssignedTo.Valid {
			resp.AssignedTo = &t.AssignedTo.String
		}
	}
	return resp
}

func toSupportMessageResponses(msgs []db.SupportMessage, admin bool) []supportMessageResponse {
	out := make([]supportMessageResponse, 0, len(msgs))
	for _, m := range msgs {
		name := m.AuthorName
		if m.AuthorKind == "staff" && !admin {
			name = supportStaffName
		}
		out = append(out, supportMessageResponse{
			ID: m.ID, AuthorKind: m.AuthorKind, AuthorName: name, Body: m.Body, Internal: m.Internal,
			CreatedAt: m.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func supportAuthorName(c *db.Customer) string {
	if n := strings.TrimSpace(c.Name); n != "" {
		return n
	}
	return c.Email
}

// validSupportBody trims a message and checks its length.
func validSupportBody(body string) (string, string) {
	body = strings.TrimSpace(body)
	switch {
	case body == "":
		return "", "message is required"
	case len(body) > supportBodyMax:
		return "", fmt.Sprintf("message is too long (at most %d characters)", supportBodyMax)
	}
	return body, ""
}

// ListSupportTickets -> GET /api/support/tickets
func (a *App) ListSupportTickets(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	tickets, err := a.Store.ListSupportTicketsForOrganization(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load tickets")
		return
	}
	out := make([]supportTicketResponse, 0, len(tickets))
	for i := range tickets {
		out = append(out, toSupportTicketResponse(&tickets[i], false))
	}
	writeJSON(w, http.StatusOK, out)
}

type createSupportTicketRequest struct {
	Subject  string `json:"subject"`
	Category string `json:"category"`
	DomainID string `json:"domainId"`
	Body     string `json:"body"`
}

// CreateSupportTicket -> POST /api/support/tickets
func (a *App) CreateSupportTicket(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	var req createSupportTicketRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	subject := strings.TrimSpace(req.Subject)
	if subject == "" {
		writeError(w, http.StatusBadRequest, "subject is required")
		return
	}
	if len(subject) > supportSubjectMax {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("subject is too long (at most %d characters)", supportSubjectMax))
		return
	}
	if !supportCategories[req.Category] {
		writeError(w, http.StatusBadRequest, "choose a topic")
		return
	}
	body, msg := validSupportBody(req.Body)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	orgID := customer.OrganizationID.String
	var domainID *string
	if req.DomainID != "" {
		if !uuidPattern.MatchString(req.DomainID) {
			writeError(w, http.StatusBadRequest, "domain not found")
			return
		}
		if _, err := a.Store.GetDomainForOrganization(r.Context(), orgID, req.DomainID); err != nil {
			writeError(w, http.StatusBadRequest, "domain not found")
			return
		}
		domainID = &req.DomainID
	}
	if n, err := a.Store.CountOpenSupportTickets(r.Context(), orgID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create ticket")
		return
	} else if n >= supportOpenTicketsMax {
		writeError(w, http.StatusConflict, "you have too many open tickets; close one or reply to an existing ticket")
		return
	}

	ticket, err := a.Store.CreateSupportTicket(r.Context(), orgID, customer.ID, supportAuthorName(customer), subject, req.Category, domainID, body)
	if err != nil {
		log.Printf("support: create ticket: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create ticket")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), orgID, &customer.ID, customer.Email,
		"support.ticket_created", "support_ticket", ticket.ID, fmt.Sprintf("#%d %s", ticket.Number, ticket.Subject), nil, requestIP(r))
	a.notifySupport(ticket, "New ticket", body)
	writeJSON(w, http.StatusCreated, toSupportTicketResponse(ticket, false))
}

// loadSupportTicket resolves {id} within the caller's organization.
func (a *App) loadSupportTicket(w http.ResponseWriter, r *http.Request, organizationID string) (*db.SupportTicket, bool) {
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		writeError(w, http.StatusNotFound, "ticket not found")
		return nil, false
	}
	t, err := a.Store.GetSupportTicketForOrganization(r.Context(), organizationID, id)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "ticket not found")
		return nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load ticket")
		return nil, false
	}
	return t, true
}

// GetSupportTicket -> GET /api/support/tickets/{id}
func (a *App) GetSupportTicket(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	t, ok := a.loadSupportTicket(w, r, customer.OrganizationID.String)
	if !ok {
		return
	}
	msgs, err := a.Store.ListSupportMessages(r.Context(), t.ID, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load messages")
		return
	}
	resp := toSupportTicketResponse(t, false)
	resp.Messages = toSupportMessageResponses(msgs, false)
	writeJSON(w, http.StatusOK, resp)
}

type supportReplyRequest struct {
	Body string `json:"body"`
}

// ReplySupportTicket -> POST /api/support/tickets/{id}/messages. A reply on
// a closed ticket opens it again.
func (a *App) ReplySupportTicket(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	t, ok := a.loadSupportTicket(w, r, customer.OrganizationID.String)
	if !ok {
		return
	}
	var req supportReplyRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body, msg := validSupportBody(req.Body)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	m, err := a.Store.AddSupportMessage(r.Context(), t.ID, "customer", &customer.ID, supportAuthorName(customer), body, false, "open")
	if err != nil {
		log.Printf("support: customer reply: %v", err)
		writeError(w, http.StatusInternalServerError, "could not send reply")
		return
	}
	a.notifySupport(t, "Customer replied", body)
	writeJSON(w, http.StatusCreated, toSupportMessageResponses([]db.SupportMessage{*m}, false)[0])
}

// CloseSupportTicket -> POST /api/support/tickets/{id}/close
func (a *App) CloseSupportTicket(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	t, ok := a.loadSupportTicket(w, r, customer.OrganizationID.String)
	if !ok {
		return
	}
	closed := "closed"
	if err := a.Store.UpdateSupportTicket(r.Context(), t.ID, &closed, nil, nil); err != nil {
		writeError(w, http.StatusInternalServerError, "could not close ticket")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), t.OrganizationID, &customer.ID, customer.Email,
		"support.ticket_closed", "support_ticket", t.ID, fmt.Sprintf("#%d %s", t.Number, t.Subject), nil, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// AdminListSupportTickets -> GET /internal/admin/support/tickets?status=&q=
func (a *App) AdminListSupportTickets(w http.ResponseWriter, r *http.Request, operator string) {
	status := r.URL.Query().Get("status")
	if status == "all" {
		status = ""
	}
	if status != "" && status != "open" && status != "answered" && status != "closed" {
		writeError(w, http.StatusBadRequest, "status must be open, answered, closed or all")
		return
	}
	tickets, err := a.Store.ListSupportTickets(r.Context(), status, r.URL.Query().Get("q"), 200)
	if err != nil {
		log.Printf("support: admin list: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load tickets")
		return
	}
	counts, err := a.Store.SupportTicketCounts(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load ticket counts")
		return
	}
	out := make([]supportTicketResponse, 0, len(tickets))
	for i := range tickets {
		out = append(out, toSupportTicketResponse(&tickets[i], true))
	}
	writeJSON(w, http.StatusOK, map[string]any{"tickets": out, "counts": counts})
}

func (a *App) adminLoadSupportTicket(w http.ResponseWriter, r *http.Request) (*db.SupportTicket, bool) {
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		writeError(w, http.StatusNotFound, "ticket not found")
		return nil, false
	}
	t, err := a.Store.GetSupportTicket(r.Context(), id)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "ticket not found")
		return nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load ticket")
		return nil, false
	}
	return t, true
}

// AdminGetSupportTicket -> GET /internal/admin/support/tickets/{id}, with
// internal notes.
func (a *App) AdminGetSupportTicket(w http.ResponseWriter, r *http.Request, operator string) {
	t, ok := a.adminLoadSupportTicket(w, r)
	if !ok {
		return
	}
	msgs, err := a.Store.ListSupportMessages(r.Context(), t.ID, true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load messages")
		return
	}
	resp := toSupportTicketResponse(t, true)
	resp.Messages = toSupportMessageResponses(msgs, true)
	writeJSON(w, http.StatusOK, resp)
}

type adminSupportReplyRequest struct {
	Body     string `json:"body"`
	Internal bool   `json:"internal"`
	// Status after the reply; defaults to "answered" (internal notes leave it).
	Status string `json:"status"`
}

// AdminReplySupportTicket -> POST /internal/admin/support/tickets/{id}/messages.
// A reply (not an internal note) emails the person who opened the ticket.
func (a *App) AdminReplySupportTicket(w http.ResponseWriter, r *http.Request, operator string) {
	t, ok := a.adminLoadSupportTicket(w, r)
	if !ok {
		return
	}
	var req adminSupportReplyRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body, msg := validSupportBody(req.Body)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	status := req.Status
	if status == "" {
		status = "answered"
	}
	if status != "open" && status != "answered" && status != "closed" {
		writeError(w, http.StatusBadRequest, "status must be open, answered or closed")
		return
	}
	m, err := a.Store.AddSupportMessage(r.Context(), t.ID, "staff", nil, operator, body, req.Internal, status)
	if err != nil {
		log.Printf("support: staff reply: %v", err)
		writeError(w, http.StatusInternalServerError, "could not save reply")
		return
	}
	action := "support.replied"
	if req.Internal {
		action = "support.note_added"
	} else {
		a.notifyCustomerOfReply(t, body, status == "closed")
	}
	a.Store.LogAdminAction(r.Context(), "support_ticket", t.ID, operator, action, fmt.Sprintf("#%d", t.Number))
	writeJSON(w, http.StatusCreated, toSupportMessageResponses([]db.SupportMessage{*m}, true)[0])
}

type adminUpdateSupportTicketRequest struct {
	Status     *string `json:"status,omitempty"`
	Priority   *string `json:"priority,omitempty"`
	AssignedTo *string `json:"assignedTo,omitempty"`
}

// AdminUpdateSupportTicket -> PATCH /internal/admin/support/tickets/{id}
func (a *App) AdminUpdateSupportTicket(w http.ResponseWriter, r *http.Request, operator string) {
	t, ok := a.adminLoadSupportTicket(w, r)
	if !ok {
		return
	}
	var req adminUpdateSupportTicketRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Status != nil && *req.Status != "open" && *req.Status != "answered" && *req.Status != "closed" {
		writeError(w, http.StatusBadRequest, "status must be open, answered or closed")
		return
	}
	if req.Priority != nil && *req.Priority != "low" && *req.Priority != "normal" && *req.Priority != "high" {
		writeError(w, http.StatusBadRequest, "priority must be low, normal or high")
		return
	}
	if err := a.Store.UpdateSupportTicket(r.Context(), t.ID, req.Status, req.Priority, req.AssignedTo); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update ticket")
		return
	}
	a.Store.LogAdminAction(r.Context(), "support_ticket", t.ID, operator, "support.updated", fmt.Sprintf("#%d", t.Number))
	updated, err := a.Store.GetSupportTicket(r.Context(), t.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load ticket")
		return
	}
	writeJSON(w, http.StatusOK, toSupportTicketResponse(updated, true))
}

// notifySupport emails SupportNotifyEmail about a new ticket or reply. It
// never fails the request: Airplane shows the ticket either way.
func (a *App) notifySupport(t *db.SupportTicket, what, body string) {
	if a.Mailer == nil || a.SupportNotifyEmail == "" {
		return
	}
	subject := fmt.Sprintf("[Amelu #%d] %s: %s", t.Number, what, t.Subject)
	from := fmt.Sprintf("%s from %s (%s, %s)", what, t.OpenedByName, t.OpenedByEmail, t.OrganizationName)
	text := from + "\n\n" + body + "\n\nAnswer it in Airplane under Amelu, Support."
	htmlBody := "<p>" + html.EscapeString(from) + "</p>" +
		"<pre style=\"white-space:pre-wrap;font-family:inherit\">" + html.EscapeString(body) + "</pre><p>Answer it in Airplane under Amelu, Support.</p>"
	go a.sendSupportMail(a.SupportNotifyEmail, subject, htmlBody, text)
}

// notifyCustomerOfReply emails the person who opened the ticket that support
// answered, with a link back to the conversation.
func (a *App) notifyCustomerOfReply(t *db.SupportTicket, body string, closed bool) {
	if a.Mailer == nil || t.OpenedByEmail == "" {
		return
	}
	link := fmt.Sprintf("%s/support/tickets/%s", strings.TrimRight(a.FrontendOrigin, "/"), t.ID)
	subject := fmt.Sprintf("Re: %s [#%d]", t.Subject, t.Number)
	after := "Reply or close the ticket in your dashboard."
	if closed {
		after = "We've closed the ticket. Reply in your dashboard if you still need help and it opens again."
	}
	text := fmt.Sprintf("Amelu Support replied to your ticket #%d:\n\n%s\n\n%s\n%s\n", t.Number, body, after, link)
	htmlBody := fmt.Sprintf("<p>Amelu Support replied to your ticket #%d:</p>", t.Number) +
		"<blockquote style=\"margin:0;padding-left:12px;border-left:3px solid #ddd;white-space:pre-wrap\">" + html.EscapeString(body) + "</blockquote>" +
		"<p>" + html.EscapeString(after) + "</p>" +
		"<p><a href=\"" + html.EscapeString(link) + "\">Open the ticket</a></p>" +
		"<p style=\"color:#888\">Replies to this email are not read; answer in the dashboard instead.</p>"
	go a.sendSupportMail(t.OpenedByEmail, subject, htmlBody, text)
}

func (a *App) sendSupportMail(to, subject, htmlBody, text string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := a.Mailer.SendEmail(ctx, to, subject, htmlBody, text); err != nil {
		log.Printf("support: email to %s: %v", to, err)
	}
}
