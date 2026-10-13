package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"amelu/backend/internal/stalwart"
)

// decodeJSONInto decodes the body into v and also into raw, so a handler
// can tell "field absent" from "field null" (PATCH semantics).
func decodeJSONInto(r *http.Request, v any, raw *map[string]any) error {
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, v); err != nil {
		return err
	}
	return json.Unmarshal(body, raw)
}

// WebmailListMessages -> GET /api/webmail/messages
func (a *App) WebmailListMessages(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	query := stalwart.MailQuery{
		FolderID: q.Get("folder"),
		Text:     strings.TrimSpace(q.Get("q")),
		Unread:   q.Get("unread") == "1",
		Flagged:  q.Get("flagged") == "1",
		Limit:    50,
	}
	if query.FolderID == "" && query.Text == "" {
		writeError(w, http.StatusBadRequest, "folder or q is required")
		return
	}
	if v, err := strconv.Atoi(q.Get("position")); err == nil && v >= 0 {
		query.Position = v
	}
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v > 0 {
		query.Limit = min(v, 100)
	}
	messages, total, err := a.Stalwart.QueryMail(r.Context(), u.AccountID, query)
	if err != nil {
		writeUpstreamError(w, "could not load messages", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": messages, "total": total, "position": query.Position})
}

// WebmailGetMessage -> GET /api/webmail/messages/{id}
func (a *App) WebmailGetMessage(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	m, err := a.Stalwart.GetMail(r.Context(), u.AccountID, r.PathValue("id"))
	if errors.Is(err, stalwart.ErrNotFound) {
		writeError(w, http.StatusNotFound, "message not found")
		return
	} else if err != nil {
		writeUpstreamError(w, "could not load the message", err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// WebmailRawMessage -> GET /api/webmail/messages/{id}/raw
func (a *App) WebmailRawMessage(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	m, err := a.Stalwart.GetMail(r.Context(), u.AccountID, r.PathValue("id"))
	if errors.Is(err, stalwart.ErrNotFound) {
		writeError(w, http.StatusNotFound, "message not found")
		return
	} else if err != nil {
		writeUpstreamError(w, "could not load the message", err)
		return
	}
	name := strings.TrimSpace(m.Subject)
	if name == "" {
		name = "message"
	}
	a.streamBlob(w, r, u.AccountID, m.BlobID, name+".eml", "message/rfc822", false)
}

func idsBody(r *http.Request) (ids []string, body map[string]json.RawMessage, err error) {
	defer r.Body.Close()
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		return nil, nil, err
	}
	if err := json.Unmarshal(body["ids"], &ids); err != nil || len(ids) == 0 || len(ids) > 500 {
		return nil, nil, errors.New("ids must list 1 to 500 message ids")
	}
	return ids, body, nil
}

// WebmailSetFlags -> POST /api/webmail/messages/flags
func (a *App) WebmailSetFlags(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	ids, body, err := idsBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var seen, flagged *bool
	if raw, ok := body["seen"]; ok {
		json.Unmarshal(raw, &seen)
	}
	if raw, ok := body["flagged"]; ok {
		json.Unmarshal(raw, &flagged)
	}
	if err := a.Stalwart.SetFlags(r.Context(), u.AccountID, ids, seen, flagged); err != nil {
		writeUpstreamError(w, "could not update the messages", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// WebmailMoveMessages -> POST /api/webmail/messages/move
func (a *App) WebmailMoveMessages(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	ids, body, err := idsBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var folderID string
	if json.Unmarshal(body["folderId"], &folderID) != nil || folderID == "" {
		writeError(w, http.StatusBadRequest, "folderId is required")
		return
	}
	if err := a.Stalwart.MoveMail(r.Context(), u.AccountID, ids, folderID); err != nil {
		writeUpstreamError(w, "could not move the messages", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// WebmailDeleteMessages -> POST /api/webmail/messages/delete
//
// Messages go to Trash; messages already in Trash are destroyed.
func (a *App) WebmailDeleteMessages(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	ids, _, err := idsBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	folders, err := a.Stalwart.ListFolders(r.Context(), u.AccountID)
	if err != nil {
		writeUpstreamError(w, "could not load folders", err)
		return
	}
	trash, ok := stalwart.FolderByRole(folders, "trash")
	if !ok {
		writeErrorCode(w, http.StatusBadGateway, codeMailClusterProtocol, "the mailbox has no Trash folder", "")
		return
	}
	inFolders, err := a.Stalwart.MailFolders(r.Context(), u.AccountID, ids)
	if err != nil {
		writeUpstreamError(w, "could not load the messages", err)
		return
	}
	var toTrash, toDestroy []string
	for _, id := range ids {
		if len(inFolders[id]) == 1 && inFolders[id][0] == trash.ID {
			toDestroy = append(toDestroy, id)
		} else if _, exists := inFolders[id]; exists {
			toTrash = append(toTrash, id)
		}
	}
	if err := a.Stalwart.MoveMail(r.Context(), u.AccountID, toTrash, trash.ID); err != nil {
		writeUpstreamError(w, "could not delete the messages", err)
		return
	}
	if err := a.Stalwart.DestroyMail(r.Context(), u.AccountID, toDestroy); err != nil {
		writeUpstreamError(w, "could not delete the messages", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// WebmailSpam -> POST /api/webmail/messages/spam
func (a *App) WebmailSpam(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	ids, body, err := idsBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var spam bool
	json.Unmarshal(body["spam"], &spam)
	folders, err := a.Stalwart.ListFolders(r.Context(), u.AccountID)
	if err != nil {
		writeUpstreamError(w, "could not load folders", err)
		return
	}
	role := "inbox"
	if spam {
		role = "junk"
	}
	target, ok := stalwart.FolderByRole(folders, role)
	if !ok {
		writeErrorCode(w, http.StatusBadGateway, codeMailClusterProtocol, "the mailbox has no "+role+" folder", "")
		return
	}
	if err := a.Stalwart.MoveMail(r.Context(), u.AccountID, ids, target.ID); err != nil {
		writeUpstreamError(w, "could not move the messages", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- blobs ---

const maxUploadBytes = 25 << 20

// WebmailDownloadBlob -> GET /api/webmail/blobs/{blobId}
func (a *App) WebmailDownloadBlob(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	contentType := q.Get("type")
	inline := q.Get("inline") == "1" && strings.HasPrefix(contentType, "image/")
	a.streamBlob(w, r, u.AccountID, r.PathValue("blobId"), q.Get("name"), contentType, inline)
}

func (a *App) streamBlob(w http.ResponseWriter, r *http.Request, accountID, blobID, name, contentType string, inline bool) {
	resp, err := a.Stalwart.DownloadBlob(r.Context(), accountID, blobID, name, contentType)
	if errors.Is(err, stalwart.ErrNotFound) {
		writeError(w, http.StatusNotFound, "attachment not found")
		return
	} else if err != nil {
		writeUpstreamError(w, "could not download the attachment", err)
		return
	}
	defer resp.Body.Close()
	if contentType == "" {
		contentType = resp.Header.Get("Content-Type")
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if name == "" {
		name = "attachment"
	}
	disposition := "attachment"
	if inline {
		disposition = "inline"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": name}))
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	w.WriteHeader(http.StatusOK)
	io.Copy(w, resp.Body)
}

// WebmailUploadBlob -> POST /api/webmail/blobs
func (a *App) WebmailUploadBlob(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	if r.ContentLength > maxUploadBytes {
		writeErrorCode(w, http.StatusRequestEntityTooLarge, "BLOB_TOO_LARGE", fmt.Sprintf("attachments can be at most %d MB", maxUploadBytes>>20), "")
		return
	}
	body := http.MaxBytesReader(w, r.Body, maxUploadBytes)
	defer body.Close()
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	blob, err := a.Stalwart.UploadBlob(r.Context(), u.AccountID, body, contentType)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeErrorCode(w, http.StatusRequestEntityTooLarge, "BLOB_TOO_LARGE", fmt.Sprintf("attachments can be at most %d MB", maxUploadBytes>>20), "")
			return
		}
		writeUpstreamError(w, "could not upload the attachment", err)
		return
	}
	name := r.Header.Get("X-File-Name")
	if decoded, err := url.PathUnescape(name); err == nil {
		name = decoded
	}
	writeJSON(w, http.StatusCreated, map[string]any{"blobId": blob.BlobID, "name": name, "type": blob.Type, "size": blob.Size})
}
