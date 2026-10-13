package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

// The webmail API (docs/WEBMAIL.md): a mailbox user, signed in with the
// mailbox password, reading and sending their own mail. Sessions are
// auth.RequireWebmail's; every cluster call uses the account id the session
// carries.

func requireWebmailUser(w http.ResponseWriter, r *http.Request) (*db.WebmailUser, bool) {
	u, ok := auth.WebmailUserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
	}
	return u, ok
}

type webmailAccount struct {
	Email       string        `json:"email"`
	DisplayName string        `json:"displayName"`
	Domain      string        `json:"domain"`
	Quota       *webmailQuota `json:"quota"`
}

type webmailQuota struct {
	UsedBytes int64 `json:"usedBytes"`
	MaxBytes  int64 `json:"maxBytes"`
}

func (a *App) webmailAccount(r *http.Request, u *db.WebmailUser) webmailAccount {
	out := webmailAccount{Email: u.Email(), DisplayName: u.DisplayName, Domain: u.DomainName}
	// Best effort: a missing quota is not a reason to fail sign-in.
	if used, max, ok, err := a.Stalwart.GetQuota(r.Context(), u.AccountID); err == nil && ok {
		out.Quota = &webmailQuota{UsedBytes: used, MaxBytes: max}
	}
	return out
}

// WebmailLogin -> POST /api/webmail/login
func (a *App) WebmailLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 || req.Password == "" {
		writeErrorCode(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "wrong email address or password", "")
		return
	}
	user, err := a.Store.FindMailboxByAddress(r.Context(), email[:at], email[at+1:])
	if errors.Is(err, db.ErrNotFound) {
		writeErrorCode(w, http.StatusNotFound, "MAILBOX_NOT_FOUND", "there is no Amelu mailbox with this address", "")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not look up the mailbox")
		return
	}
	if user.Status != "active" {
		writeErrorCode(w, http.StatusForbidden, "MAILBOX_SUSPENDED", "this mailbox is suspended", "")
		return
	}

	accountID, err := a.Stalwart.AuthenticateUser(r.Context(), email, req.Password)
	if errors.Is(err, stalwart.ErrInvalidCredentials) {
		writeErrorCode(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "wrong email address or password", "")
		return
	} else if err != nil {
		writeUpstreamError(w, "could not sign in", err)
		return
	}
	user.AccountID = accountID

	token, hash, err := auth.NewSessionToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start session")
		return
	}
	expires := time.Now().Add(auth.WebmailSessionTTL)
	if err := a.Store.CreateWebmailSession(r.Context(), hash, user.MailboxID, accountID, expires); err != nil {
		writeError(w, http.StatusInternalServerError, "could not start session")
		return
	}
	auth.SetWebmailCookie(w, token, expires, a.CookieSecure)
	writeJSON(w, http.StatusOK, map[string]any{"account": a.webmailAccount(r, user)})
}

// WebmailLogout -> POST /api/webmail/logout
func (a *App) WebmailLogout(w http.ResponseWriter, r *http.Request) {
	if token, ok := auth.WebmailTokenFromRequest(r); ok {
		a.Store.DeleteWebmailSession(r.Context(), auth.HashToken(token))
	}
	auth.ClearWebmailCookie(w, a.CookieSecure)
	w.WriteHeader(http.StatusNoContent)
}

// WebmailMe -> GET /api/webmail/me
func (a *App) WebmailMe(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"account": a.webmailAccount(r, u)})
}

// --- folders ---

// WebmailListFolders -> GET /api/webmail/folders
func (a *App) WebmailListFolders(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	folders, err := a.Stalwart.ListFolders(r.Context(), u.AccountID)
	if err != nil {
		writeUpstreamError(w, "could not load folders", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"folders": folders})
}

// WebmailCreateFolder -> POST /api/webmail/folders
func (a *App) WebmailCreateFolder(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Name     string `json:"name"`
		ParentID string `json:"parentId"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	folder, err := a.Stalwart.CreateFolder(r.Context(), u.AccountID, strings.TrimSpace(req.Name), req.ParentID)
	if err != nil {
		writeUpstreamError(w, "could not create the folder", err)
		return
	}
	writeJSON(w, http.StatusCreated, folder)
}

// WebmailUpdateFolder -> PATCH /api/webmail/folders/{id}
func (a *App) WebmailUpdateFolder(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Name     *string `json:"name"`
		ParentID *string `json:"parentId"`
	}
	raw := map[string]any{}
	if err := decodeJSONInto(r, &req, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, setParent := raw["parentId"]
	name := ""
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	parentID := ""
	if req.ParentID != nil {
		parentID = *req.ParentID
	}
	if name == "" && !setParent {
		writeError(w, http.StatusBadRequest, "nothing to change")
		return
	}
	folder, err := a.Stalwart.UpdateFolder(r.Context(), u.AccountID, r.PathValue("id"), name, setParent, parentID)
	if err != nil {
		writeUpstreamError(w, "could not update the folder", err)
		return
	}
	writeJSON(w, http.StatusOK, folder)
}

// WebmailDeleteFolder -> DELETE /api/webmail/folders/{id}
func (a *App) WebmailDeleteFolder(w http.ResponseWriter, r *http.Request) {
	u, ok := requireWebmailUser(w, r)
	if !ok {
		return
	}
	folders, err := a.Stalwart.ListFolders(r.Context(), u.AccountID)
	if err != nil {
		writeUpstreamError(w, "could not load folders", err)
		return
	}
	id := r.PathValue("id")
	for _, f := range folders {
		if f.ID == id && f.Role != "" {
			writeErrorCode(w, http.StatusForbidden, "FOLDER_PROTECTED", "system folders can't be deleted", "")
			return
		}
	}
	trash, ok := stalwart.FolderByRole(folders, "trash")
	if !ok {
		writeErrorCode(w, http.StatusBadGateway, codeMailClusterProtocol, "the mailbox has no Trash folder", "")
		return
	}
	if err := a.Stalwart.DeleteFolder(r.Context(), u.AccountID, id, trash.ID); err != nil {
		writeUpstreamError(w, "could not delete the folder", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
