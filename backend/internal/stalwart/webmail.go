package stalwart

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Everything the webmail (docs/WEBMAIL.md) needs from the cluster. These
// take the account id directly: the session already knows it, so there is
// no address-to-account lookup per call as in the dashboard methods.

// ErrInvalidCredentials: the mail cluster rejected the user's password.
var ErrInvalidCredentials = errors.New("invalid credentials")

// AuthenticateUser opens a JMAP session as the user: the one call made with
// the user's own credentials rather than the admin's. 200 proves the
// password and names the account; 401 means it is wrong.
func (c *Client) AuthenticateUser(ctx context.Context, email, password string) (accountID string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/.well-known/jmap", nil)
	if err != nil {
		return "", &Error{Kind: KindProtocol, Method: "session", Err: err}
	}
	req.SetBasicAuth(email, password)
	resp, err := c.http.Do(req)
	if err != nil {
		return "", transportError("session", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return "", ErrInvalidCredentials
	}
	if resp.StatusCode != http.StatusOK {
		return "", &Error{Kind: KindHTTP, Method: "session", Status: resp.StatusCode, Err: errors.New(resp.Status)}
	}
	var session struct {
		PrimaryAccounts map[string]string `json:"primaryAccounts"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return "", &Error{Kind: KindProtocol, Method: "session", Err: err}
	}
	id := session.PrimaryAccounts["urn:ietf:params:jmap:mail"]
	if id == "" {
		return "", &Error{Kind: KindProtocol, Method: "session", Err: errors.New("session has no mail account")}
	}
	return id, nil
}

// --- folders ---

type Folder struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Role      string `json:"role,omitempty"`
	ParentID  string `json:"parentId,omitempty"`
	Unread    int    `json:"unread"`
	Total     int    `json:"total"`
	SortOrder int    `json:"sortOrder"`
}

type jmapMailbox struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Role         string `json:"role"`
	ParentID     string `json:"parentId"`
	UnreadEmails int    `json:"unreadEmails"`
	TotalEmails  int    `json:"totalEmails"`
	SortOrder    int    `json:"sortOrder"`
}

func (m *jmapMailbox) folder() Folder {
	return Folder{ID: m.ID, Name: m.Name, Role: m.Role, ParentID: m.ParentID, Unread: m.UnreadEmails, Total: m.TotalEmails, SortOrder: m.SortOrder}
}

var folderProperties = []string{"id", "name", "role", "parentId", "unreadEmails", "totalEmails", "sortOrder"}

func (c *Client) getFolders(ctx context.Context, accountID string, ids []string) ([]Folder, error) {
	args := map[string]any{"accountId": accountID, "properties": folderProperties}
	if ids == nil {
		args["ids"] = nil
	} else {
		args["ids"] = ids
	}
	raw, err := c.call(ctx, "Mailbox/get", args)
	if err != nil {
		return nil, err
	}
	var result struct {
		List []jmapMailbox `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode folders: %w", err)
	}
	out := make([]Folder, 0, len(result.List))
	for i := range result.List {
		out = append(out, result.List[i].folder())
	}
	return out, nil
}

func (c *Client) ListFolders(ctx context.Context, accountID string) ([]Folder, error) {
	return c.getFolders(ctx, accountID, nil)
}

// FolderByRole finds a system folder ("inbox", "trash", ...) in a list.
func FolderByRole(folders []Folder, role string) (Folder, bool) {
	for _, f := range folders {
		if f.Role == role {
			return f, true
		}
	}
	return Folder{}, false
}

func (c *Client) CreateFolder(ctx context.Context, accountID, name, parentID string) (*Folder, error) {
	create := map[string]any{"name": name}
	if parentID != "" {
		create["parentId"] = parentID
	}
	raw, err := c.call(ctx, "Mailbox/set", map[string]any{"accountId": accountID, "create": map[string]any{"f0": create}})
	if err != nil {
		return nil, err
	}
	var result struct {
		Created    map[string]struct{ ID string } `json:"created"`
		NotCreated map[string]json.RawMessage     `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode create folder: %w", err)
	}
	if reason, ok := result.NotCreated["f0"]; ok {
		return nil, &Error{Kind: KindJMAP, Method: "Mailbox/set", JMAPType: "notCreated", Err: errors.New(string(reason))}
	}
	folders, err := c.getFolders(ctx, accountID, []string{result.Created["f0"].ID})
	if err != nil || len(folders) == 0 {
		return nil, fmt.Errorf("reload created folder: %w", err)
	}
	return &folders[0], nil
}

// UpdateFolder renames and/or re-parents a folder. parentID is only applied
// when setParent is true; an empty parentID then means top level.
func (c *Client) UpdateFolder(ctx context.Context, accountID, id string, name string, setParent bool, parentID string) (*Folder, error) {
	patch := map[string]any{}
	if name != "" {
		patch["name"] = name
	}
	if setParent {
		if parentID == "" {
			patch["parentId"] = nil
		} else {
			patch["parentId"] = parentID
		}
	}
	raw, err := c.call(ctx, "Mailbox/set", map[string]any{"accountId": accountID, "update": map[string]any{id: patch}})
	if err != nil {
		return nil, err
	}
	if err := jmapNotUpdated(raw, id, "Mailbox/set"); err != nil {
		return nil, err
	}
	folders, err := c.getFolders(ctx, accountID, []string{id})
	if err != nil || len(folders) == 0 {
		return nil, fmt.Errorf("reload folder: %w", err)
	}
	return &folders[0], nil
}

// DeleteFolder moves the folder's mail to trashID, then destroys it. The
// move comes first so a failed destroy never loses mail.
func (c *Client) DeleteFolder(ctx context.Context, accountID, id, trashID string) error {
	for {
		ids, _, err := c.queryIDs(ctx, accountID, MailQuery{FolderID: id, Limit: 500})
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			break
		}
		if err := c.MoveMail(ctx, accountID, ids, trashID); err != nil {
			return err
		}
	}
	raw, err := c.call(ctx, "Mailbox/set", map[string]any{"accountId": accountID, "destroy": []string{id}})
	if err != nil {
		return err
	}
	return jmapNotDestroyed(raw, id, "Mailbox/set")
}

// --- messages ---

type MailSummary struct {
	ID             string    `json:"id"`
	ThreadID       string    `json:"threadId,omitempty"`
	Subject        string    `json:"subject"`
	From           []Address `json:"from"`
	To             []Address `json:"to"`
	ReceivedAt     string    `json:"receivedAt"`
	Preview        string    `json:"preview,omitempty"`
	HasAttachments bool      `json:"hasAttachments"`
	Seen           bool      `json:"seen"`
	Flagged        bool      `json:"flagged"`
	Answered       bool      `json:"answered"`
	Forwarded      bool      `json:"forwarded"`
	Draft          bool      `json:"draft"`
	Size           int64     `json:"size"`
	FolderIDs      []string  `json:"folderIds"`
}

type MailAttachment struct {
	BlobID string `json:"blobId"`
	Name   string `json:"name,omitempty"`
	Type   string `json:"type,omitempty"`
	Size   int64  `json:"size"`
	CID    string `json:"cid,omitempty"`
	Inline bool   `json:"inline"`
}

type Mail struct {
	MailSummary
	CC          []Address        `json:"cc"`
	BCC         []Address        `json:"bcc"`
	ReplyTo     []Address        `json:"replyTo"`
	MessageID   []string         `json:"messageId"`
	InReplyTo   []string         `json:"inReplyTo"`
	References  []string         `json:"references"`
	SentAt      string           `json:"sentAt,omitempty"`
	TextBody    string           `json:"textBody"`
	HTMLBody    string           `json:"htmlBody"`
	Attachments []MailAttachment `json:"attachments"`
	// BlobID is the whole message as message/rfc822.
	BlobID string `json:"-"`
}

type jmapMail struct {
	jmapEmail
	// Shadows jmapEmail.HTMLBody: JMAP lists the text/plain part under
	// htmlBody too when there is no HTML, and that must not be rendered as HTML.
	HTMLParts []struct {
		PartID string `json:"partId"`
		Type   string `json:"type"`
	} `json:"htmlBody"`
	BCC        []Address       `json:"bcc"`
	References []string        `json:"references"`
	SentAt     string          `json:"sentAt"`
	Size       int64           `json:"size"`
	BlobID     string          `json:"blobId"`
	MailboxIDs map[string]bool `json:"mailboxIds"`
	Parts      []struct {
		BlobID      string `json:"blobId"`
		Name        string `json:"name"`
		Type        string `json:"type"`
		Size        int64  `json:"size"`
		CID         string `json:"cid"`
		Disposition string `json:"disposition"`
	} `json:"attachments"`
}

func (e *jmapMail) mailSummary() MailSummary {
	folderIDs := make([]string, 0, len(e.MailboxIDs))
	for id, in := range e.MailboxIDs {
		if in {
			folderIDs = append(folderIDs, id)
		}
	}
	return MailSummary{
		ID: e.ID, ThreadID: e.ThreadID, Subject: e.Subject, From: e.From, To: e.To,
		ReceivedAt: e.ReceivedAt, Preview: e.Preview, HasAttachments: e.HasAttach,
		Seen: e.Keywords["$seen"], Flagged: e.Keywords["$flagged"], Answered: e.Keywords["$answered"],
		Forwarded: e.Keywords["$forwarded"], Draft: e.Keywords["$draft"], Size: e.Size, FolderIDs: folderIDs,
	}
}

var mailSummaryProperties = []string{
	"id", "threadId", "subject", "from", "to", "receivedAt", "preview", "hasAttachment", "keywords", "size", "mailboxIds",
}

var mailFullProperties = append([]string{
	"cc", "bcc", "replyTo", "messageId", "inReplyTo", "references", "sentAt", "blobId", "bodyValues", "textBody", "htmlBody", "attachments",
}, mailSummaryProperties...)

type MailQuery struct {
	FolderID string
	Text     string
	Unread   bool
	Flagged  bool
	Position int
	Limit    int
}

func (q MailQuery) filter() map[string]any {
	conditions := []map[string]any{}
	if q.FolderID != "" {
		conditions = append(conditions, map[string]any{"inMailbox": q.FolderID})
	}
	if q.Text != "" {
		conditions = append(conditions, map[string]any{"text": q.Text})
	}
	if q.Unread {
		conditions = append(conditions, map[string]any{"notKeyword": "$seen"})
	}
	if q.Flagged {
		conditions = append(conditions, map[string]any{"hasKeyword": "$flagged"})
	}
	switch len(conditions) {
	case 0:
		return map[string]any{}
	case 1:
		return conditions[0]
	default:
		return map[string]any{"operator": "AND", "conditions": conditions}
	}
}

func (c *Client) queryIDs(ctx context.Context, accountID string, q MailQuery) (ids []string, total int, err error) {
	raw, err := c.call(ctx, "Email/query", map[string]any{
		"accountId":      accountID,
		"filter":         q.filter(),
		"sort":           []map[string]any{{"property": "receivedAt", "isAscending": false}},
		"position":       q.Position,
		"limit":          q.Limit,
		"calculateTotal": true,
	})
	if err != nil {
		return nil, 0, err
	}
	var result struct {
		IDs   []string `json:"ids"`
		Total int      `json:"total"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, 0, fmt.Errorf("decode mail query: %w", err)
	}
	return result.IDs, result.Total, nil
}

// QueryMail lists messages newest first. total is the full match count.
func (c *Client) QueryMail(ctx context.Context, accountID string, q MailQuery) ([]MailSummary, int, error) {
	ids, total, err := c.queryIDs(ctx, accountID, q)
	if err != nil {
		return nil, 0, err
	}
	if len(ids) == 0 {
		return []MailSummary{}, total, nil
	}
	raw, err := c.call(ctx, "Email/get", map[string]any{"accountId": accountID, "ids": ids, "properties": mailSummaryProperties})
	if err != nil {
		return nil, 0, err
	}
	var result struct {
		List []jmapMail `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, 0, fmt.Errorf("decode mail list: %w", err)
	}
	// Email/get returns in id order, not necessarily the query's; restore it.
	byID := make(map[string]*jmapMail, len(result.List))
	for i := range result.List {
		byID[result.List[i].ID] = &result.List[i]
	}
	out := make([]MailSummary, 0, len(ids))
	for _, id := range ids {
		if m, ok := byID[id]; ok {
			out = append(out, m.mailSummary())
		}
	}
	return out, total, nil
}

func (c *Client) GetMail(ctx context.Context, accountID, id string) (*Mail, error) {
	raw, err := c.call(ctx, "Email/get", map[string]any{
		"accountId":           accountID,
		"ids":                 []string{id},
		"properties":          mailFullProperties,
		"fetchTextBodyValues": true,
		"fetchHTMLBodyValues": true,
		"maxBodyValueBytes":   4 * 1024 * 1024,
	})
	if err != nil {
		return nil, err
	}
	var result struct {
		List []jmapMail `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode mail: %w", err)
	}
	if len(result.List) == 0 {
		return nil, ErrNotFound
	}
	e := &result.List[0]
	m := &Mail{
		MailSummary: e.mailSummary(),
		CC:          nonNil(e.CC), BCC: nonNil(e.BCC), ReplyTo: nonNil(e.ReplyTo),
		MessageID: nonNilStr(e.MessageID), InReplyTo: nonNilStr(e.InReplyTo), References: nonNilStr(e.References),
		SentAt:      e.SentAt,
		TextBody:    e.bodyFor(e.TextBody),
		HTMLBody:    e.htmlOnly(),
		Attachments: make([]MailAttachment, 0, len(e.Parts)),
		BlobID:      e.BlobID,
	}
	for _, p := range e.Parts {
		m.Attachments = append(m.Attachments, MailAttachment{
			BlobID: p.BlobID, Name: p.Name, Type: p.Type, Size: p.Size, CID: p.CID, Inline: p.Disposition == "inline",
		})
	}
	return m, nil
}

// htmlOnly joins the HTML body parts, and only those: a message without an
// HTML alternative gets an empty HTMLBody, so the client shows the text.
func (e *jmapMail) htmlOnly() string {
	var b strings.Builder
	for _, p := range e.HTMLParts {
		if p.Type != "text/html" {
			continue
		}
		if v, ok := e.BodyValues[p.PartID]; ok {
			b.WriteString(v.Value)
		}
	}
	return b.String()
}

func nonNil(a []Address) []Address {
	if a == nil {
		return []Address{}
	}
	return a
}

func nonNilStr(a []string) []string {
	if a == nil {
		return []string{}
	}
	return a
}

// SetFlags sets or clears $seen and $flagged on the given messages; a nil
// pointer leaves that flag alone.
func (c *Client) SetFlags(ctx context.Context, accountID string, ids []string, seen, flagged *bool) error {
	patch := map[string]any{}
	if seen != nil {
		patch["keywords/$seen"] = keyword(*seen)
	}
	if flagged != nil {
		patch["keywords/$flagged"] = keyword(*flagged)
	}
	if len(patch) == 0 || len(ids) == 0 {
		return nil
	}
	return c.updateMail(ctx, accountID, ids, patch)
}

func keyword(on bool) any {
	if on {
		return true
	}
	return nil
}

// MoveMail files the messages in exactly one folder.
func (c *Client) MoveMail(ctx context.Context, accountID string, ids []string, folderID string) error {
	if len(ids) == 0 {
		return nil
	}
	return c.updateMail(ctx, accountID, ids, map[string]any{"mailboxIds": map[string]bool{folderID: true}})
}

func (c *Client) updateMail(ctx context.Context, accountID string, ids []string, patch map[string]any) error {
	update := make(map[string]any, len(ids))
	for _, id := range ids {
		update[id] = patch
	}
	raw, err := c.call(ctx, "Email/set", map[string]any{"accountId": accountID, "update": update})
	if err != nil {
		return err
	}
	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode mail update: %w", err)
	}
	for id, reason := range result.NotUpdated {
		return &Error{Kind: KindJMAP, Method: "Email/set", JMAPType: "notUpdated", Err: fmt.Errorf("%s: %s", id, reason)}
	}
	return nil
}

func (c *Client) DestroyMail(ctx context.Context, accountID string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	raw, err := c.call(ctx, "Email/set", map[string]any{"accountId": accountID, "destroy": ids})
	if err != nil {
		return err
	}
	var result struct {
		NotDestroyed map[string]json.RawMessage `json:"notDestroyed"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode mail destroy: %w", err)
	}
	for id, reason := range result.NotDestroyed {
		var r struct {
			Type string `json:"type"`
		}
		json.Unmarshal(reason, &r)
		if r.Type == "notFound" {
			continue
		}
		return &Error{Kind: KindJMAP, Method: "Email/set", JMAPType: "notDestroyed", Err: fmt.Errorf("%s: %s", id, reason)}
	}
	return nil
}

// --- blobs ---

// DownloadBlob streams a blob from the cluster. The caller must close the
// body. Not-found is reported as ErrNotFound.
func (c *Client) DownloadBlob(ctx context.Context, accountID, blobID, name, contentType string) (*http.Response, error) {
	if name == "" {
		name = "attachment"
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	u := fmt.Sprintf("%s/jmap/download/%s/%s/%s?accept=%s", c.baseURL, url.PathEscape(accountID), url.PathEscape(blobID), url.PathEscape(name), url.QueryEscape(contentType))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, &Error{Kind: KindProtocol, Method: "download", Err: err}
	}
	req.SetBasicAuth(c.user, c.password)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, transportError("download", err)
	}
	if resp.StatusCode == http.StatusNotFound {
		resp.Body.Close()
		return nil, ErrNotFound
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		kind := KindHTTP
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			kind = KindAuth
		}
		return nil, &Error{Kind: kind, Method: "download", Status: resp.StatusCode, Err: errors.New(resp.Status)}
	}
	return resp, nil
}

type UploadedBlob struct {
	BlobID string `json:"blobId"`
	Type   string `json:"type"`
	Size   int64  `json:"size"`
}

// UploadBlob stores content under the account and returns its blob id,
// for attaching to a draft.
func (c *Client) UploadBlob(ctx context.Context, accountID string, content io.Reader, contentType string) (*UploadedBlob, error) {
	u := fmt.Sprintf("%s/jmap/upload/%s/", c.baseURL, url.PathEscape(accountID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, content)
	if err != nil {
		return nil, &Error{Kind: KindProtocol, Method: "upload", Err: err}
	}
	req.SetBasicAuth(c.user, c.password)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	req.Header.Set("Content-Type", contentType)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, transportError("upload", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, &Error{Kind: KindHTTP, Method: "upload", Status: resp.StatusCode, Err: errors.New(string(body))}
	}
	var out UploadedBlob
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, &Error{Kind: KindProtocol, Method: "upload", Err: err}
	}
	return &out, nil
}

// --- drafts and sending ---

type Draft struct {
	To          []Address
	CC          []Address
	BCC         []Address
	Subject     string
	Text        string
	HTML        string
	Attachments []MailAttachment
	InReplyTo   string
	References  []string
}

// emailObject is the JMAP Email/set "create" object for a draft or an
// outgoing message. With attachments present the server builds the
// multipart structure itself (RFC 8621 section 4.6).
func emailObject(from Address, d Draft, folderID string, keywords map[string]bool) map[string]any {
	email := map[string]any{
		"mailboxIds": map[string]bool{folderID: true},
		"keywords":   keywords,
		"from":       []Address{from},
		"to":         nonNil(d.To),
		"subject":    d.Subject,
	}
	if len(d.CC) > 0 {
		email["cc"] = d.CC
	}
	if len(d.BCC) > 0 {
		email["bcc"] = d.BCC
	}
	if d.InReplyTo != "" {
		email["inReplyTo"] = []string{d.InReplyTo}
	}
	if len(d.References) > 0 {
		email["references"] = d.References
	}
	bodyValues := map[string]any{"text": map[string]any{"value": d.Text}}
	email["textBody"] = []map[string]any{{"partId": "text", "type": "text/plain"}}
	if d.HTML != "" {
		bodyValues["html"] = map[string]any{"value": d.HTML}
		email["htmlBody"] = []map[string]any{{"partId": "html", "type": "text/html"}}
	}
	email["bodyValues"] = bodyValues
	if len(d.Attachments) > 0 {
		parts := make([]map[string]any, 0, len(d.Attachments))
		for _, a := range d.Attachments {
			parts = append(parts, map[string]any{"blobId": a.BlobID, "type": a.Type, "name": a.Name, "disposition": "attachment"})
		}
		email["attachments"] = parts
	}
	return email
}

func (c *Client) createEmail(ctx context.Context, accountID string, email map[string]any) (string, error) {
	raw, err := c.call(ctx, "Email/set", map[string]any{"accountId": accountID, "create": map[string]any{"e0": email}})
	if err != nil {
		return "", err
	}
	var result struct {
		Created    map[string]struct{ ID string } `json:"created"`
		NotCreated map[string]json.RawMessage     `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("decode create email: %w", err)
	}
	if reason, ok := result.NotCreated["e0"]; ok {
		return "", &Error{Kind: KindJMAP, Method: "Email/set", JMAPType: "notCreated", Err: errors.New(string(reason))}
	}
	if result.Created["e0"].ID == "" {
		return "", &Error{Kind: KindProtocol, Method: "Email/set", Err: errors.New("no id for created email")}
	}
	return result.Created["e0"].ID, nil
}

// SaveDraft stores the draft in draftsID and returns its id.
func (c *Client) SaveDraft(ctx context.Context, accountID string, from Address, d Draft, draftsID string) (string, error) {
	return c.createEmail(ctx, accountID, emailObject(from, d, draftsID, map[string]bool{"$draft": true, "$seen": true}))
}

// SendMail submits the draft as `from` and files it in sentID. Like Send in
// messages.go: create first, then submit, cleaning up on a failed submit.
func (c *Client) SendMail(ctx context.Context, accountID string, from Address, identityID string, d Draft, draftsID, sentID string) (string, error) {
	emailID, err := c.createEmail(ctx, accountID, emailObject(from, d, draftsID, map[string]bool{"$draft": true, "$seen": true}))
	if err != nil {
		return "", err
	}
	rcpt := make([]map[string]any, 0, len(d.To)+len(d.CC)+len(d.BCC))
	for _, list := range [][]Address{d.To, d.CC, d.BCC} {
		for _, a := range list {
			rcpt = append(rcpt, map[string]any{"email": a.Email})
		}
	}
	raw, err := c.call(ctx, "EmailSubmission/set", map[string]any{
		"accountId": accountID,
		"create": map[string]any{"s0": map[string]any{
			"emailId":    emailID,
			"identityId": identityID,
			"envelope":   map[string]any{"mailFrom": map[string]any{"email": from.Email}, "rcptTo": rcpt},
		}},
		"onSuccessUpdateEmail": map[string]any{"#s0": map[string]any{
			"mailboxIds/" + draftsID: nil,
			"mailboxIds/" + sentID:   true,
			"keywords/$draft":        nil,
			"keywords/$seen":         true,
		}},
	})
	if err != nil {
		c.destroyEmail(ctx, accountID, emailID)
		return "", err
	}
	var result struct {
		NotCreated map[string]json.RawMessage `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("decode submission: %w", err)
	}
	if reason, ok := result.NotCreated["s0"]; ok {
		c.destroyEmail(ctx, accountID, emailID)
		return "", &Error{Kind: KindJMAP, Method: "EmailSubmission/set", JMAPType: "notCreated", Err: errors.New(string(reason))}
	}
	return emailID, nil
}

// --- settings ---

type IdentitySettings struct {
	ID            string `json:"-"`
	Name          string `json:"name"`
	Email         string `json:"-"`
	TextSignature string `json:"textSignature"`
	HTMLSignature string `json:"htmlSignature"`
}

// GetIdentity returns the account's identity for `email`, or its first one.
func (c *Client) GetIdentity(ctx context.Context, accountID, email string) (*IdentitySettings, error) {
	raw, err := c.call(ctx, "Identity/get", map[string]any{"accountId": accountID, "ids": nil})
	if err != nil {
		return nil, err
	}
	var result struct {
		List []struct {
			ID            string `json:"id"`
			Name          string `json:"name"`
			Email         string `json:"email"`
			TextSignature string `json:"textSignature"`
			HTMLSignature string `json:"htmlSignature"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode identities: %w", err)
	}
	if len(result.List) == 0 {
		return nil, fmt.Errorf("identity for %s: %w", email, ErrNotFound)
	}
	pick := result.List[0]
	for _, id := range result.List {
		if strings.EqualFold(id.Email, email) {
			pick = id
			break
		}
	}
	return &IdentitySettings{ID: pick.ID, Name: pick.Name, Email: pick.Email, TextSignature: pick.TextSignature, HTMLSignature: pick.HTMLSignature}, nil
}

func (c *Client) UpdateIdentity(ctx context.Context, accountID, identityID, name, textSignature string) error {
	raw, err := c.call(ctx, "Identity/set", map[string]any{
		"accountId": accountID,
		"update":    map[string]any{identityID: map[string]any{"name": name, "textSignature": textSignature}},
	})
	if err != nil {
		return err
	}
	return jmapNotUpdated(raw, identityID, "Identity/set")
}

type Vacation struct {
	Enabled bool   `json:"enabled"`
	Subject string `json:"subject"`
	Text    string `json:"text"`
	From    string `json:"from,omitempty"`
	To      string `json:"to,omitempty"`
}

func (c *Client) GetVacation(ctx context.Context, accountID string) (*Vacation, error) {
	raw, err := c.call(ctx, "VacationResponse/get", map[string]any{"accountId": accountID, "ids": nil})
	if err != nil {
		return nil, err
	}
	var result struct {
		List []struct {
			IsEnabled bool   `json:"isEnabled"`
			FromDate  string `json:"fromDate"`
			ToDate    string `json:"toDate"`
			Subject   string `json:"subject"`
			TextBody  string `json:"textBody"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode vacation: %w", err)
	}
	if len(result.List) == 0 {
		return &Vacation{}, nil
	}
	v := result.List[0]
	return &Vacation{Enabled: v.IsEnabled, Subject: v.Subject, Text: v.TextBody, From: v.FromDate, To: v.ToDate}, nil
}

func (c *Client) SetVacation(ctx context.Context, accountID string, v Vacation) error {
	patch := map[string]any{"isEnabled": v.Enabled, "subject": v.Subject, "textBody": v.Text, "fromDate": nil, "toDate": nil}
	if v.From != "" {
		patch["fromDate"] = v.From
	}
	if v.To != "" {
		patch["toDate"] = v.To
	}
	raw, err := c.call(ctx, "VacationResponse/set", map[string]any{"accountId": accountID, "update": map[string]any{"singleton": patch}})
	if err != nil {
		return err
	}
	return jmapNotUpdated(raw, "singleton", "VacationResponse/set")
}

// GetQuota returns the account's storage use and cap in bytes; ok is false
// when the cluster reports no byte quota for it.
func (c *Client) GetQuota(ctx context.Context, accountID string) (used, max int64, ok bool, err error) {
	raw, err := c.call(ctx, "Quota/get", map[string]any{"accountId": accountID, "ids": nil})
	if err != nil {
		return 0, 0, false, err
	}
	var result struct {
		List []struct {
			ResourceType string `json:"resourceType"`
			Used         int64  `json:"used"`
			HardLimit    int64  `json:"hardLimit"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return 0, 0, false, fmt.Errorf("decode quota: %w", err)
	}
	for _, q := range result.List {
		if q.ResourceType == "octets" {
			return q.Used, q.HardLimit, q.HardLimit > 0, nil
		}
	}
	return 0, 0, false, nil
}

// SetAccountPassword replaces the account's password credential, the same
// slot CreateMailbox and SetMailboxPassword use.
func (c *Client) SetAccountPassword(ctx context.Context, accountID, newPassword string) error {
	raw, err := c.call(ctx, "x:Account/set", map[string]any{
		"update": map[string]any{accountID: map[string]any{"credentials/0": map[string]any{"@type": "Password", "secret": newPassword}}},
	})
	if err != nil {
		return err
	}
	return jmapNotUpdated(raw, accountID, "x:Account/set")
}

func jmapNotUpdated(raw json.RawMessage, id, method string) error {
	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode %s: %w", method, err)
	}
	if reason, ok := result.NotUpdated[id]; ok {
		return &Error{Kind: KindJMAP, Method: method, JMAPType: "notUpdated", Err: errors.New(string(reason))}
	}
	return nil
}

func jmapNotDestroyed(raw json.RawMessage, id, method string) error {
	var result struct {
		NotDestroyed map[string]json.RawMessage `json:"notDestroyed"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode %s: %w", method, err)
	}
	if reason, ok := result.NotDestroyed[id]; ok {
		return &Error{Kind: KindJMAP, Method: method, JMAPType: "notDestroyed", Err: errors.New(string(reason))}
	}
	return nil
}

// MailFolders returns, per message id, the folders it is filed in. Ids
// that don't exist are simply absent.
func (c *Client) MailFolders(ctx context.Context, accountID string, ids []string) (map[string][]string, error) {
	raw, err := c.call(ctx, "Email/get", map[string]any{"accountId": accountID, "ids": ids, "properties": []string{"id", "mailboxIds"}})
	if err != nil {
		return nil, err
	}
	var result struct {
		List []struct {
			ID         string          `json:"id"`
			MailboxIDs map[string]bool `json:"mailboxIds"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode mail folders: %w", err)
	}
	out := make(map[string][]string, len(result.List))
	for _, m := range result.List {
		for id, in := range m.MailboxIDs {
			if in {
				out[m.ID] = append(out[m.ID], id)
			}
		}
	}
	return out, nil
}

// SetKeyword sets or clears one keyword ("$answered", "$forwarded") on the
// given messages.
func (c *Client) SetKeyword(ctx context.Context, accountID string, ids []string, kw string, on bool) error {
	if len(ids) == 0 {
		return nil
	}
	return c.updateMail(ctx, accountID, ids, map[string]any{"keywords/" + kw: keyword(on)})
}
