package stalwart

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Address is one participant on a message. JMAP returns name and email
// separately; both are passed through as-is.
type Address struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email"`
}

// MessageSummary is one message without its body - what a list endpoint
// returns. Preview is Stalwart's own short plain-text excerpt.
type MessageSummary struct {
	ID             string    `json:"id"`
	ThreadID       string    `json:"threadId,omitempty"`
	Subject        string    `json:"subject"`
	From           []Address `json:"from"`
	To             []Address `json:"to"`
	ReceivedAt     string    `json:"receivedAt"`
	Preview        string    `json:"preview,omitempty"`
	HasAttachments bool      `json:"hasAttachments"`
	Seen           bool      `json:"seen"`
}

// Attachment describes one attached part. Content is deliberately absent:
// listing what is attached is cheap, downloading it is not, and no caller
// has asked for the bytes yet.
type Attachment struct {
	Name string `json:"name,omitempty"`
	Type string `json:"type,omitempty"`
	Size int64  `json:"size"`
}

// Message is a full message: summary plus decoded bodies and attachment
// metadata.
type Message struct {
	MessageSummary
	CC          []Address    `json:"cc,omitempty"`
	ReplyTo     []Address    `json:"replyTo,omitempty"`
	MessageID   []string     `json:"messageId,omitempty"`
	InReplyTo   []string     `json:"inReplyTo,omitempty"`
	TextBody    string       `json:"textBody,omitempty"`
	HTMLBody    string       `json:"htmlBody,omitempty"`
	Attachments []Attachment `json:"attachments"`
}

// maxBodyValueBytes caps how much of a body JMAP will decode for us. A
// runaway newsletter must not turn one API call into a multi-megabyte
// response; truncation is reported per body value by the server.
const maxBodyValueBytes = 256 * 1024

const (
	RoleInbox = "inbox"
	RoleSent  = "sent"
)

// jmapEmail is the wire shape of a JMAP Email object, covering both the
// summary and full-message property sets.
type jmapEmail struct {
	ID         string          `json:"id"`
	ThreadID   string          `json:"threadId"`
	Subject    string          `json:"subject"`
	From       []Address       `json:"from"`
	To         []Address       `json:"to"`
	CC         []Address       `json:"cc"`
	ReplyTo    []Address       `json:"replyTo"`
	MessageID  []string        `json:"messageId"`
	InReplyTo  []string        `json:"inReplyTo"`
	ReceivedAt string          `json:"receivedAt"`
	Preview    string          `json:"preview"`
	HasAttach  bool            `json:"hasAttachment"`
	Keywords   map[string]bool `json:"keywords"`
	BodyValues map[string]struct {
		Value       string `json:"value"`
		IsTruncated bool   `json:"isTruncated"`
	} `json:"bodyValues"`
	TextBody []struct {
		PartID string `json:"partId"`
	} `json:"textBody"`
	HTMLBody []struct {
		PartID string `json:"partId"`
	} `json:"htmlBody"`
	Attachments []struct {
		Name string `json:"name"`
		Type string `json:"type"`
		Size int64  `json:"size"`
	} `json:"attachments"`
}

func (e *jmapEmail) summary() MessageSummary {
	return MessageSummary{
		ID:             e.ID,
		ThreadID:       e.ThreadID,
		Subject:        e.Subject,
		From:           e.From,
		To:             e.To,
		ReceivedAt:     e.ReceivedAt,
		Preview:        e.Preview,
		HasAttachments: e.HasAttach,
		Seen:           e.Keywords["$seen"],
	}
}

// bodyFor joins the decoded body values for the given part list. A body can
// arrive as several parts (JMAP does not guarantee one), so they are
// concatenated in order rather than only the first one being taken.
func (e *jmapEmail) bodyFor(parts []struct {
	PartID string `json:"partId"`
}) string {
	var b strings.Builder
	for _, p := range parts {
		if v, ok := e.BodyValues[p.PartID]; ok {
			b.WriteString(v.Value)
		}
	}
	return b.String()
}

var summaryProperties = []string{
	"id", "threadId", "subject", "from", "to", "receivedAt", "preview", "hasAttachment", "keywords",
}

var fullProperties = append([]string{
	"cc", "replyTo", "messageId", "inReplyTo", "bodyValues", "textBody", "htmlBody", "attachments",
}, summaryProperties...)

// mailboxIDForRole resolves a system mailbox ("inbox", "sent", ...) to its
// JMAP id within the account.
func (c *Client) mailboxIDForRole(ctx context.Context, accountID, role string) (string, error) {
	raw, err := c.call(ctx, "Mailbox/query", map[string]any{
		"accountId": accountID,
		"filter":    map[string]any{"role": role},
	})
	if err != nil {
		return "", fmt.Errorf("find %s mailbox: %w", role, err)
	}
	var result struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("decode mailbox query response: %w", err)
	}
	if len(result.IDs) == 0 {
		return "", fmt.Errorf("%s mailbox: %w", role, ErrNotFound)
	}
	return result.IDs[0], nil
}

// ListMessages returns messages in the named system mailbox, newest first.
// position is a zero-based offset into that sorted list, which is how JMAP
// paginates - the caller passes back position+len(results) to get the next
// page. total is the full match count, so a caller knows when to stop.
func (c *Client) ListMessages(ctx context.Context, localPart, domainName, role string, limit, position int) (messages []MessageSummary, total int, err error) {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return nil, 0, fmt.Errorf("resolve account for messages: %w", err)
	}
	mailboxID, err := c.mailboxIDForRole(ctx, accountID, role)
	if err != nil {
		return nil, 0, fmt.Errorf("list messages for %s@%s: %w", localPart, domainName, err)
	}

	raw, err := c.call(ctx, "Email/query", map[string]any{
		"accountId":       accountID,
		"filter":          map[string]any{"inMailbox": mailboxID},
		"sort":            []map[string]any{{"property": "receivedAt", "isAscending": false}},
		"limit":           limit,
		"position":        position,
		"calculateTotal":  true,
		"collapseThreads": false,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("query messages for %s@%s: %w", localPart, domainName, err)
	}
	var query struct {
		IDs   []string `json:"ids"`
		Total int      `json:"total"`
	}
	if err := json.Unmarshal(raw, &query); err != nil {
		return nil, 0, fmt.Errorf("decode message query response: %w", err)
	}
	if len(query.IDs) == 0 {
		return []MessageSummary{}, query.Total, nil
	}

	raw, err = c.call(ctx, "Email/get", map[string]any{
		"accountId":  accountID,
		"ids":        query.IDs,
		"properties": summaryProperties,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("get messages for %s@%s: %w", localPart, domainName, err)
	}
	var get struct {
		List []jmapEmail `json:"list"`
	}
	if err := json.Unmarshal(raw, &get); err != nil {
		return nil, 0, fmt.Errorf("decode messages response: %w", err)
	}

	out := make([]MessageSummary, 0, len(get.List))
	for i := range get.List {
		out = append(out, get.List[i].summary())
	}
	return out, query.Total, nil
}

// GetMessage returns one message with its decoded bodies. The id must belong
// to this mailbox's own JMAP account - ids from another account resolve to
// nothing here rather than to someone else's mail.
func (c *Client) GetMessage(ctx context.Context, localPart, domainName, messageID string) (*Message, error) {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return nil, fmt.Errorf("resolve account for message: %w", err)
	}

	raw, err := c.call(ctx, "Email/get", map[string]any{
		"accountId":           accountID,
		"ids":                 []string{messageID},
		"properties":          fullProperties,
		"fetchTextBodyValues": true,
		"fetchHTMLBodyValues": true,
		"maxBodyValueBytes":   maxBodyValueBytes,
	})
	if err != nil {
		return nil, fmt.Errorf("get message %s for %s@%s: %w", messageID, localPart, domainName, err)
	}
	var get struct {
		List []jmapEmail `json:"list"`
	}
	if err := json.Unmarshal(raw, &get); err != nil {
		return nil, fmt.Errorf("decode message response: %w", err)
	}
	if len(get.List) == 0 {
		return nil, ErrNotFound
	}

	e := &get.List[0]
	msg := &Message{
		MessageSummary: e.summary(),
		CC:             e.CC,
		ReplyTo:        e.ReplyTo,
		MessageID:      e.MessageID,
		InReplyTo:      e.InReplyTo,
		TextBody:       e.bodyFor(e.TextBody),
		HTMLBody:       e.bodyFor(e.HTMLBody),
		Attachments:    make([]Attachment, 0, len(e.Attachments)),
	}
	for _, a := range e.Attachments {
		msg.Attachments = append(msg.Attachments, Attachment{Name: a.Name, Type: a.Type, Size: a.Size})
	}
	return msg, nil
}

// SendMessage is an outgoing message. From is not a field: a message is
// always sent as the mailbox it was submitted through.
type SendMessage struct {
	To       []Address
	CC       []Address
	Subject  string
	TextBody string
	HTMLBody string
}

// Send delivers a message as localPart@domainName and files it in Sent.
//
// JMAP submission is two steps: the message is created as a draft, then an
// EmailSubmission is created referencing it. These are two separate requests
// rather than one with back-references, so a failure at the submission step
// is distinguishable from a failure to build the message - the draft is
// cleaned up in that case so a failed send leaves no half-message behind.
func (c *Client) Send(ctx context.Context, localPart, domainName string, msg SendMessage) (string, error) {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return "", fmt.Errorf("resolve account for send: %w", err)
	}

	address := localPart + "@" + domainName
	identities, err := c.ListIdentities(ctx, localPart, domainName)
	if err != nil {
		return "", fmt.Errorf("resolve identity for send: %w", err)
	}
	identityID := ""
	for _, id := range identities {
		if strings.EqualFold(id.Email, address) {
			identityID = id.ID
			break
		}
	}
	if identityID == "" {
		return "", fmt.Errorf("no send identity for %s: %w", address, ErrNotFound)
	}

	draftsID, err := c.mailboxIDForRole(ctx, accountID, "drafts")
	if err != nil {
		return "", fmt.Errorf("send as %s: %w", address, err)
	}
	sentID, err := c.mailboxIDForRole(ctx, accountID, RoleSent)
	if err != nil {
		return "", fmt.Errorf("send as %s: %w", address, err)
	}

	email := map[string]any{
		"mailboxIds": map[string]bool{draftsID: true},
		"keywords":   map[string]bool{"$draft": true},
		"from":       []Address{{Email: address}},
		"to":         msg.To,
		"subject":    msg.Subject,
	}
	if len(msg.CC) > 0 {
		email["cc"] = msg.CC
	}

	bodyValues := map[string]any{}
	if msg.TextBody != "" {
		bodyValues["text"] = map[string]any{"value": msg.TextBody}
		email["textBody"] = []map[string]any{{"partId": "text", "type": "text/plain"}}
	}
	if msg.HTMLBody != "" {
		bodyValues["html"] = map[string]any{"value": msg.HTMLBody}
		email["htmlBody"] = []map[string]any{{"partId": "html", "type": "text/html"}}
	}
	email["bodyValues"] = bodyValues

	raw, err := c.call(ctx, "Email/set", map[string]any{
		"accountId": accountID,
		"create":    map[string]any{"e0": email},
	})
	if err != nil {
		return "", fmt.Errorf("create draft for %s: %w", address, err)
	}
	var created struct {
		Created map[string]struct {
			ID string `json:"id"`
		} `json:"created"`
		NotCreated map[string]json.RawMessage `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &created); err != nil {
		return "", fmt.Errorf("decode draft response: %w", err)
	}
	if reason, ok := created.NotCreated["e0"]; ok {
		return "", fmt.Errorf("stalwart refused the message from %s: %s", address, reason)
	}
	emailID := created.Created["e0"].ID
	if emailID == "" {
		return "", fmt.Errorf("stalwart returned no message id for %s", address)
	}

	envelopeTo := make([]map[string]any, 0, len(msg.To)+len(msg.CC))
	for _, rcpt := range append(append([]Address{}, msg.To...), msg.CC...) {
		envelopeTo = append(envelopeTo, map[string]any{"email": rcpt.Email})
	}

	raw, err = c.call(ctx, "EmailSubmission/set", map[string]any{
		"accountId": accountID,
		"create": map[string]any{
			"s0": map[string]any{
				"emailId":    emailID,
				"identityId": identityID,
				"envelope": map[string]any{
					"mailFrom": map[string]any{"email": address},
					"rcptTo":   envelopeTo,
				},
			},
		},
		// Filing the message in Sent is part of the same call: if submission
		// fails there is nothing to move, and if it succeeds the message must
		// not stay a draft.
		"onSuccessUpdateEmail": map[string]any{
			"#s0": map[string]any{
				"mailboxIds/" + draftsID: nil,
				"mailboxIds/" + sentID:   true,
				"keywords/$draft":        nil,
				"keywords/$seen":         true,
			},
		},
	})
	if err != nil {
		c.destroyEmail(ctx, accountID, emailID)
		return "", fmt.Errorf("submit message from %s: %w", address, err)
	}
	var submitted struct {
		NotCreated map[string]json.RawMessage `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &submitted); err != nil {
		return "", fmt.Errorf("decode submission response: %w", err)
	}
	if reason, ok := submitted.NotCreated["s0"]; ok {
		c.destroyEmail(ctx, accountID, emailID)
		return "", fmt.Errorf("stalwart refused to send from %s: %s", address, reason)
	}

	return emailID, nil
}

// destroyEmail removes a message, used to clean up a draft whose submission
// failed. Best effort: the send has already failed, and a leftover draft is
// not worth failing louder over.
func (c *Client) destroyEmail(ctx context.Context, accountID, emailID string) {
	c.call(ctx, "Email/set", map[string]any{
		"accountId": accountID,
		"destroy":   []string{emailID},
	})
}
