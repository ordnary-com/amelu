package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"mime"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"amelu/backend/internal/db"
)

// Support tickets: customers open and answer them in the dashboard, support
// answers from Airplane's Amelu section (/internal/admin/support). See
// migration 0047.

const (
	supportSubjectMax     = 150
	supportBodyMax        = 20000
	supportOpenTicketsMax = 20
	// Shown with a staff reply's author.
	supportStaffTitle = "Amelu Support"
	// Files sent with one message: how many, and how large each and together.
	supportAttachmentsPerMessage = 5
	supportAttachmentMax         = 10 << 20
	supportAttachmentsMax        = 20 << 20
)

var (
	supportCategories = map[string]bool{"account": true, "domains": true, "delivery": true, "billing": true, "other": true}
	uuidPattern       = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

type supportMessageResponse struct {
	ID         string `json:"id"`
	AuthorKind string `json:"authorKind"`
	AuthorName string `json:"authorName"`
	// Who wrote it, for the avatar and the tooltip.
	AuthorEmail     string `json:"authorEmail,omitempty"`
	AuthorAvatarURL string `json:"authorAvatarUrl,omitempty"`
	// Staff replies: their role, e.g. "Amelu Support".
	AuthorTitle string                      `json:"authorTitle,omitempty"`
	Body        string                      `json:"body"`
	Internal    bool                        `json:"internal,omitempty"`
	CreatedAt   string                      `json:"createdAt"`
	Attachments []supportAttachmentResponse `json:"attachments"`
}

type supportAttachmentResponse struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int    `json:"size"`
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
		name, email, avatar, title := m.AuthorName, m.AuthorEmail, m.AuthorAvatarURL, ""
		if m.AuthorKind == "staff" {
			// Staff are stored by their Ordnary email. Airplane keeps the
			// email as the name (it marks your own replies by it).
			email, title = m.AuthorName, supportStaffTitle
			avatar = m.StaffAvatarURL
			if avatar == "" {
				avatar = gravatarURL(email)
			}
			if !admin {
				name = m.StaffName
				if name == "" {
					name = nameFromEmail(email)
				}
			}
		}
		files := make([]supportAttachmentResponse, 0, len(m.Attachments))
		for _, f := range m.Attachments {
			files = append(files, supportAttachmentResponse{ID: f.ID, Filename: f.Filename, ContentType: f.ContentType, Size: f.Size})
		}
		out = append(out, supportMessageResponse{
			ID: m.ID, AuthorKind: m.AuthorKind, AuthorName: name, AuthorEmail: email, AuthorAvatarURL: avatar, AuthorTitle: title,
			Body: m.Body, Internal: m.Internal, Attachments: files,
			CreatedAt: m.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

// gravatarURL is the Gravatar picture for an email (SHA-256, as Gravatar
// accepts); d=404 lets the dashboard fall back to initials.
func gravatarURL(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	if !strings.Contains(email, "@") {
		return ""
	}
	sum := sha256.Sum256([]byte(email))
	return "https://gravatar.com/avatar/" + hex.EncodeToString(sum[:]) + "?s=96&d=404"
}

// nameFromEmail turns "stijn.jakobs@ordnary.com" into "Stijn Jakobs".
func nameFromEmail(email string) string {
	local, _, _ := strings.Cut(email, "@")
	parts := strings.FieldsFunc(local, func(r rune) bool { return r == '.' || r == '_' || r == '-' })
	for i, p := range parts {
		parts[i] = strings.ToUpper(p[:1]) + p[1:]
	}
	if len(parts) == 0 {
		return supportStaffTitle
	}
	return strings.Join(parts, " ")
}

func supportAuthorName(c *db.Customer) string {
	if n := strings.TrimSpace(c.Name); n != "" {
		return n
	}
	return c.Email
}

// validSupportBody trims a message and checks its length. It may be empty
// when files come with it.
func validSupportBody(body string, hasFiles bool) (string, string) {
	body = strings.TrimSpace(body)
	switch {
	case body == "" && !hasFiles:
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
	body, msg := validSupportBody(req.Body, false)
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

// supportMessageInput is a message as posted: JSON, or multipart/form-data
// when files come with it (fields body, internal and status, files under
// "files").
type supportMessageInput struct {
	Body     string `json:"body"`
	Internal bool   `json:"internal"`
	// Staff only: the status after the reply.
	Status string                    `json:"status"`
	Files  []db.NewSupportAttachment `json:"-"`
}

// readSupportMessage parses a posted message and its files, enforcing the
// attachment limits. It writes the error response itself.
func readSupportMessage(w http.ResponseWriter, r *http.Request) (*supportMessageInput, bool) {
	in := &supportMessageInput{}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := decodeJSON(r, in); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return nil, false
		}
		return in, true
	}
	r.Body = http.MaxBytesReader(w, r.Body, supportAttachmentsMax+1<<20)
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("attachments are too large (at most %d MB together)", supportAttachmentsMax>>20))
			return nil, false
		}
		writeError(w, http.StatusBadRequest, "invalid request body")
		return nil, false
	}
	defer r.MultipartForm.RemoveAll()
	in.Body = r.FormValue("body")
	in.Internal = r.FormValue("internal") == "true"
	in.Status = r.FormValue("status")
	headers := r.MultipartForm.File["files"]
	if len(headers) > supportAttachmentsPerMessage {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("at most %d attachments per message", supportAttachmentsPerMessage))
		return nil, false
	}
	total := 0
	for _, h := range headers {
		name := cleanAttachmentName(h.Filename)
		if h.Size > supportAttachmentMax {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("%s is too large (at most %d MB)", name, supportAttachmentMax>>20))
			return nil, false
		}
		f, err := h.Open()
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return nil, false
		}
		data, err := io.ReadAll(io.LimitReader(f, supportAttachmentMax+1))
		f.Close()
		if err != nil || len(data) > supportAttachmentMax {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return nil, false
		}
		if total += len(data); total > supportAttachmentsMax {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("attachments are too large (at most %d MB together)", supportAttachmentsMax>>20))
			return nil, false
		}
		// The type is sniffed rather than taken from the browser; downloads are
		// always served as attachments anyway (serveSupportAttachment).
		in.Files = append(in.Files, db.NewSupportAttachment{Filename: name, ContentType: http.DetectContentType(data), Data: data})
	}
	return in, true
}

// cleanAttachmentName keeps a filename's last path element without control
// characters, at most 200 characters long.
func cleanAttachmentName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if runes := []rune(name); len(runes) > 200 {
		name = string(runes[:200])
	}
	if name == "" || name == "." || name == "/" {
		return "attachment"
	}
	return name
}

// withAttachmentNote adds "(2 attachments)" to a notification's text.
func withAttachmentNote(body string, files int) string {
	if files == 0 {
		return body
	}
	note := fmt.Sprintf("(%d attachments)", files)
	if files == 1 {
		note = "(1 attachment)"
	}
	return strings.TrimSpace(body + "\n\n" + note)
}

// serveSupportAttachment sends a file as a download, never rendered by the
// browser, so an uploaded page or script can't run on the API's origin.
func serveSupportAttachment(w http.ResponseWriter, a *db.SupportAttachment, data []byte) {
	h := w.Header()
	h.Set("Content-Type", a.ContentType)
	h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": a.Filename}))
	h.Set("Content-Length", strconv.Itoa(len(data)))
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "sandbox")
	h.Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// GetSupportAttachment -> GET /api/support/tickets/{id}/attachments/{attachmentId}
func (a *App) GetSupportAttachment(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	t, ok := a.loadSupportTicket(w, r, customer.OrganizationID.String)
	if !ok {
		return
	}
	a.writeSupportAttachment(w, r, t.ID, false)
}

func (a *App) writeSupportAttachment(w http.ResponseWriter, r *http.Request, ticketID string, includeInternal bool) {
	id := r.PathValue("attachmentId")
	if !uuidPattern.MatchString(id) {
		writeError(w, http.StatusNotFound, "attachment not found")
		return
	}
	att, data, err := a.Store.GetSupportAttachment(r.Context(), ticketID, id, includeInternal)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "attachment not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load attachment")
		return
	}
	serveSupportAttachment(w, att, data)
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
	in, ok := readSupportMessage(w, r)
	if !ok {
		return
	}
	body, msg := validSupportBody(in.Body, len(in.Files) > 0)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	m, err := a.Store.AddSupportMessage(r.Context(), t.ID, "customer", &customer.ID, supportAuthorName(customer), body, false, "open", in.Files...)
	if err != nil {
		log.Printf("support: customer reply: %v", err)
		writeError(w, http.StatusInternalServerError, "could not send reply")
		return
	}
	a.notifySupport(t, "Customer replied", withAttachmentNote(body, len(in.Files)))
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

// AdminReplySupportTicket -> POST /internal/admin/support/tickets/{id}/messages.
// A reply (not an internal note) emails the person who opened the ticket.
func (a *App) AdminReplySupportTicket(w http.ResponseWriter, r *http.Request, operator string) {
	t, ok := a.adminLoadSupportTicket(w, r)
	if !ok {
		return
	}
	// Status after the reply defaults to "answered" (internal notes leave it).
	req, ok := readSupportMessage(w, r)
	if !ok {
		return
	}
	body, msg := validSupportBody(req.Body, len(req.Files) > 0)
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
	m, err := a.Store.AddSupportMessage(r.Context(), t.ID, "staff", nil, operator, body, req.Internal, status, req.Files...)
	if err != nil {
		log.Printf("support: staff reply: %v", err)
		writeError(w, http.StatusInternalServerError, "could not save reply")
		return
	}
	action := "support.replied"
	if req.Internal {
		action = "support.note_added"
	} else {
		a.notifyCustomerOfReply(t, withAttachmentNote(body, len(req.Files)), status == "closed")
	}
	a.Store.LogAdminAction(r.Context(), "support_ticket", t.ID, operator, action, fmt.Sprintf("#%d", t.Number))
	writeJSON(w, http.StatusCreated, toSupportMessageResponses([]db.SupportMessage{*m}, true)[0])
}

// AdminGetSupportAttachment -> GET /internal/admin/support/tickets/{id}/attachments/{attachmentId}
func (a *App) AdminGetSupportAttachment(w http.ResponseWriter, r *http.Request, operator string) {
	t, ok := a.adminLoadSupportTicket(w, r)
	if !ok {
		return
	}
	a.writeSupportAttachment(w, r, t.ID, true)
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
