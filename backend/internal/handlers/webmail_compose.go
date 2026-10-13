package handlers

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

// draftRequest is the client's draft (docs/WEBMAIL.md, "Drafts and sending").
type draftRequest struct {
	To          []stalwart.Address        `json:"to"`
	CC          []stalwart.Address        `json:"cc"`
	BCC         []stalwart.Address        `json:"bcc"`
	Subject     string                    `json:"subject"`
	Text        string                    `json:"text"`
	HTML        string                    `json:"html"`
	Attachments []stalwart.MailAttachment `json:"attachments"`
	InReplyTo   string                    `json:"inReplyTo"`
	References  []string                  `json:"references"`
	ReplyToID   string                    `json:"replyToId"`
	ForwardOfID string                    `json:"forwardOfId"`
}

func (d *draftRequest) draft() (stalwart.Draft, error) {
	out := stalwart.Draft{
		Subject: d.Subject, Text: d.Text, HTML: d.HTML, Attachments: d.Attachments,
		InReplyTo: strings.TrimSpace(d.InReplyTo), References: d.References,
	}
	var err error
	if out.To, err = cleanAddresses(d.To); err != nil {
		return out, err
	}
	if out.CC, err = cleanAddresses(d.CC); err != nil {
		return out, err
	}
	if out.BCC, err = cleanAddresses(d.BCC); err != nil {
		return out, err
	}
	for i := range out.Attachments {
		if out.Attachments[i].BlobID == "" {
			return out, errors.New("an attachment is missing its blobId")
		}
	}
	return out, nil
}

func cleanAddresses(in []stalwart.Address) ([]stalwart.Address, error) {
	out := make([]stalwart.Address, 0, len(in))
	for _, a := range in {
		email := strings.TrimSpace(a.Email)
		if email == "" {
			continue
		}
		if _, err := mail.ParseAddress(email); err != nil {
			return nil, errors.New("not a valid email address: " + email)
		}
		out = append(out, stalwart.Address{Name: strings.TrimSpace(a.Name), Email: email})
	}
	return out, nil
}

func (a *App) webmailFrom(u *db.WebmailUser) stalwart.Address {
	return stalwart.Address{Name: u.DisplayName, Email: u.Email()}
}

func (a *App) webmailSystemFolders(w http.ResponseWriter, r *http.Request, accountID string) (drafts, sent stalwart.Folder, ok bool) {
	folders, err := a.Stalwart.ListFolders(r.Context(), accountID)
	if err != nil {
		writeUpstreamError(w, "could not load folders", err)
		return
	}
	drafts, okD := stalwart.FolderByRole(folders, "drafts")
	sent, okS := stalwart.FolderByRole(folders, "sent")
	if !okD || !okS {
		writeErrorCode(w, http.StatusBadGateway, codeMailClusterProtocol, "the mailbox has no Drafts or Sent folder", "")
		return
	}
	return drafts, sent, true
}

// WebmailCreateDraft -> POST /api/webmail/drafts
func (a *App) WebmailCreateDraft(w http.ResponseWriter, r *http.Request) {
	a.webmailSaveDraft(w, r, "")
}

// WebmailUpdateDraft -> PUT /api/webmail/drafts/{id}
func (a *App) WebmailUpdateDraft(w http.ResponseWriter, r *http.Request) {
	a.webmailSaveDraft(w, r, r.PathValue("id"))
}

// JMAP messages are immutable, so a re-saved draft is a new message; the
// old one is removed after the new one exists.
func (a *App) webmailSaveDraft(w http.ResponseWriter, r *http.Request, previousID string) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	var req draftRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	d, err := req.draft()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	drafts, _, ok := a.webmailSystemFolders(w, r, u.AccountID)
	if !ok {
		return
	}
	id, err := a.Stalwart.SaveDraft(r.Context(), u.AccountID, a.webmailFrom(u), d, drafts.ID)
	if err != nil {
		writeUpstreamError(w, "could not save the draft", err)
		return
	}
	if previousID != "" {
		a.Stalwart.DestroyMail(r.Context(), u.AccountID, []string{previousID})
	}
	status := http.StatusOK
	if previousID == "" {
		status = http.StatusCreated
	}
	writeJSON(w, status, map[string]string{"id": id})
}

// WebmailDeleteDraft -> DELETE /api/webmail/drafts/{id}
func (a *App) WebmailDeleteDraft(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	if err := a.Stalwart.DestroyMail(r.Context(), u.AccountID, []string{r.PathValue("id")}); err != nil {
		writeUpstreamError(w, "could not delete the draft", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// WebmailSend -> POST /api/webmail/send
func (a *App) WebmailSend(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Draft   draftRequest `json:"draft"`
		DraftID string       `json:"draftId"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	d, err := req.Draft.draft()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(d.To)+len(d.CC)+len(d.BCC) == 0 {
		writeErrorCode(w, http.StatusBadRequest, "NO_RECIPIENTS", "add at least one recipient", "")
		return
	}
	identity, err := a.Stalwart.GetIdentity(r.Context(), u.AccountID, u.Email())
	if err != nil {
		writeUpstreamError(w, "could not find the sending identity", err)
		return
	}
	drafts, sent, ok := a.webmailSystemFolders(w, r, u.AccountID)
	if !ok {
		return
	}
	id, err := a.Stalwart.SendMail(r.Context(), u.AccountID, a.webmailFrom(u), identity.ID, d, drafts.ID, sent.ID)
	if err != nil {
		writeUpstreamError(w, "could not send the message", err)
		return
	}
	// Bookkeeping after a successful send; none of it should fail the send.
	ctx := r.Context()
	if req.Draft.ReplyToID != "" {
		a.Stalwart.SetKeyword(ctx, u.AccountID, []string{req.Draft.ReplyToID}, "$answered", true)
	}
	if req.Draft.ForwardOfID != "" {
		a.Stalwart.SetKeyword(ctx, u.AccountID, []string{req.Draft.ForwardOfID}, "$forwarded", true)
	}
	if req.DraftID != "" {
		a.Stalwart.DestroyMail(ctx, u.AccountID, []string{req.DraftID})
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id})
}

// --- settings ---

// WebmailGetSettings -> GET /api/webmail/settings
func (a *App) WebmailGetSettings(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	identity, err := a.Stalwart.GetIdentity(r.Context(), u.AccountID, u.Email())
	if err != nil {
		writeUpstreamError(w, "could not load the identity", err)
		return
	}
	vacation, err := a.Stalwart.GetVacation(r.Context(), u.AccountID)
	if err != nil {
		writeUpstreamError(w, "could not load the vacation response", err)
		return
	}
	// The client works with dates; the cluster stores instants.
	vacation.From = dateOnly(vacation.From)
	vacation.To = dateOnly(vacation.To)
	writeJSON(w, http.StatusOK, map[string]any{"identity": identity, "vacation": vacation})
}

func dateOnly(instant string) string {
	if len(instant) >= 10 {
		return instant[:10]
	}
	return ""
}

// WebmailUpdateIdentity -> PUT /api/webmail/settings/identity
func (a *App) WebmailUpdateIdentity(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Name          string `json:"name"`
		TextSignature string `json:"textSignature"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Name) > 200 || len(req.TextSignature) > 4000 {
		writeError(w, http.StatusBadRequest, "name or signature is too long")
		return
	}
	identity, err := a.Stalwart.GetIdentity(r.Context(), u.AccountID, u.Email())
	if err != nil {
		writeUpstreamError(w, "could not load the identity", err)
		return
	}
	if err := a.Stalwart.UpdateIdentity(r.Context(), u.AccountID, identity.ID, strings.TrimSpace(req.Name), req.TextSignature); err != nil {
		writeUpstreamError(w, "could not save the identity", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// WebmailUpdateVacation -> PUT /api/webmail/settings/vacation
func (a *App) WebmailUpdateVacation(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	var req stalwart.Vacation
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Enabled && strings.TrimSpace(req.Text) == "" {
		writeError(w, http.StatusBadRequest, "the reply text is required")
		return
	}
	var err error
	// A from date starts at the beginning of that day, a to date ends at the end of it.
	if req.From, err = dayInstant(req.From, false); err != nil {
		writeError(w, http.StatusBadRequest, "from must be a date (YYYY-MM-DD)")
		return
	}
	if req.To, err = dayInstant(req.To, true); err != nil {
		writeError(w, http.StatusBadRequest, "to must be a date (YYYY-MM-DD)")
		return
	}
	if err := a.Stalwart.SetVacation(r.Context(), u.AccountID, req); err != nil {
		writeUpstreamError(w, "could not save the vacation response", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func dayInstant(date string, endOfDay bool) (string, error) {
	if date == "" {
		return "", nil
	}
	// A full instant is passed through as-is; a bare date is widened to the day.
	if t, err := time.Parse(time.RFC3339, date); err == nil {
		return t.UTC().Format(time.RFC3339), nil
	}
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", err
	}
	if endOfDay {
		t = t.Add(24*time.Hour - time.Second)
	}
	return t.UTC().Format(time.RFC3339), nil
}

// WebmailChangePassword -> POST /api/webmail/settings/password
func (a *App) WebmailChangePassword(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.New) < 8 {
		writeErrorCode(w, http.StatusBadRequest, "PASSWORD_TOO_SHORT", "the new password must be at least 8 characters", "")
		return
	}
	if _, err := a.Stalwart.AuthenticateUser(r.Context(), u.Email(), req.Current); errors.Is(err, stalwart.ErrInvalidCredentials) {
		writeErrorCode(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "the current password is wrong", "")
		return
	} else if err != nil {
		writeUpstreamError(w, "could not check the current password", err)
		return
	}
	if err := a.Stalwart.SetAccountPassword(r.Context(), u.AccountID, req.New); err != nil {
		writeUpstreamError(w, "could not change the password", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
