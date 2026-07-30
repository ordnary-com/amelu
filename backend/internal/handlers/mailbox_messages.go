package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

const (
	defaultMessageLimit = 25
	maxMessageLimit     = 100
	maxRecipients       = 50
	maxSubjectLength    = 998
	maxBodyLength       = 1 << 20
)

// requireMailboxContents resolves the mailbox from the path and checks the
// caller may read or send its mail. This is the gate an API key reaches: a
// key acts as its owning customer, so an agent can only touch mailboxes in
// its own organization, and only if that customer is an owner or admin.
func (a *App) requireMailboxContents(w http.ResponseWriter, r *http.Request) (*db.Mailbox, *db.Domain, bool) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return nil, nil, false
	}
	if !authz.CanAccessMailboxContents(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to access mailbox contents")
		return nil, nil, false
	}
	return a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
}

// folderFromQuery maps the public ?folder= value onto a JMAP mailbox role.
// Only inbox and sent are exposed: those are the two an automated caller has
// a reason to read, and both exist on every account.
func folderFromQuery(r *http.Request) (string, bool) {
	switch r.URL.Query().Get("folder") {
	case "", "inbox":
		return stalwart.RoleInbox, true
	case "sent":
		return stalwart.RoleSent, true
	default:
		return "", false
	}
}

type listMessagesResponse struct {
	Messages []stalwart.MessageSummary `json:"messages"`
	Total    int                       `json:"total"`
	Position int                       `json:"position"`
}

// ListMailboxMessages returns one page of a mailbox's messages, newest first.
func (a *App) ListMailboxMessages(w http.ResponseWriter, r *http.Request) {
	mailbox, domain, ok := a.requireMailboxContents(w, r)
	if !ok {
		return
	}

	role, ok := folderFromQuery(r)
	if !ok {
		writeError(w, http.StatusBadRequest, `folder must be "inbox" or "sent"`)
		return
	}

	limit := defaultMessageLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > maxMessageLimit {
			writeError(w, http.StatusBadRequest, "limit must be between 1 and "+strconv.Itoa(maxMessageLimit))
			return
		}
		limit = n
	}

	position := 0
	if raw := r.URL.Query().Get("position"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			writeError(w, http.StatusBadRequest, "position must be zero or greater")
			return
		}
		position = n
	}

	messages, total, err := a.Stalwart.ListMessages(r.Context(), mailbox.LocalPart, domain.Name, role, limit, position)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not read messages from mail cluster: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, listMessagesResponse{Messages: messages, Total: total, Position: position})
}

// GetMailboxMessage returns one message including its decoded bodies.
func (a *App) GetMailboxMessage(w http.ResponseWriter, r *http.Request) {
	mailbox, domain, ok := a.requireMailboxContents(w, r)
	if !ok {
		return
	}

	message, err := a.Stalwart.GetMessage(r.Context(), mailbox.LocalPart, domain.Name, r.PathValue("messageId"))
	if errors.Is(err, stalwart.ErrNotFound) {
		writeError(w, http.StatusNotFound, "message not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not read message from mail cluster: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, message)
}

type sendMessageRequest struct {
	To       []string `json:"to"`
	CC       []string `json:"cc"`
	Subject  string   `json:"subject"`
	TextBody string   `json:"textBody"`
	HTMLBody string   `json:"htmlBody"`
}

type sendMessageResponse struct {
	ID string `json:"id"`
}

func toAddresses(raw []string) ([]stalwart.Address, error) {
	out := make([]stalwart.Address, 0, len(raw))
	for _, addr := range raw {
		addr = strings.TrimSpace(addr)
		if addr == "" {
			continue
		}
		if !strings.Contains(addr, "@") || strings.ContainsAny(addr, " \t\r\n,") {
			return nil, errors.New(addr + " is not a valid email address")
		}
		out = append(out, stalwart.Address{Email: addr})
	}
	return out, nil
}

// SendMailboxMessage sends mail as this mailbox. There is no From in the
// request: a message always goes out as the mailbox it was submitted through,
// so a key can never send as a colleague's address.
func (a *App) SendMailboxMessage(w http.ResponseWriter, r *http.Request) {
	mailbox, domain, ok := a.requireMailboxContents(w, r)
	if !ok {
		return
	}
	if !mailbox.MaySend {
		writeError(w, http.StatusForbidden, "sending is disabled for this mailbox")
		return
	}

	var req sendMessageRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	to, err := toAddresses(req.To)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	cc, err := toAddresses(req.CC)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(to) == 0 {
		writeError(w, http.StatusBadRequest, "at least one recipient is required")
		return
	}
	if len(to)+len(cc) > maxRecipients {
		writeError(w, http.StatusBadRequest, "too many recipients")
		return
	}

	req.Subject = strings.TrimSpace(req.Subject)
	if len(req.Subject) > maxSubjectLength {
		writeError(w, http.StatusBadRequest, "subject is too long")
		return
	}
	if req.TextBody == "" && req.HTMLBody == "" {
		writeError(w, http.StatusBadRequest, "a textBody or htmlBody is required")
		return
	}
	if len(req.TextBody) > maxBodyLength || len(req.HTMLBody) > maxBodyLength {
		writeError(w, http.StatusBadRequest, "message body is too large")
		return
	}

	id, err := a.Stalwart.Send(r.Context(), mailbox.LocalPart, domain.Name, stalwart.SendMessage{
		To:       to,
		CC:       cc,
		Subject:  req.Subject,
		TextBody: req.TextBody,
		HTMLBody: req.HTMLBody,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not send message: "+err.Error())
		return
	}

	a.Store.LogActivity(r.Context(), domain.ID, "mailbox.message_sent",
		"Sent a message from "+mailbox.LocalPart+"@"+domain.Name+" to "+to[0].Email)

	writeJSON(w, http.StatusCreated, sendMessageResponse{ID: id})
}
