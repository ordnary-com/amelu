package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// "Open in webmail": the dashboard links here, the API answers with a
// redirect into Roundcube carrying a short-lived token for the mailbox. The
// Roundcube plugin amelu_sso (on the mail host) checks the signature and
// signs the browser in as that mailbox using the cluster's admin
// credentials with the mailbox as authorization identity, so no mailbox
// password is involved. See docs/WEBMAIL.md.

const webmailSSOTokenTTL = 60 * time.Second

// webmailSSOToken is base64url(payload) + "." + hex(HMAC-SHA256(secret, payload)).
func webmailSSOToken(secret, email string, now time.Time) string {
	payload, _ := json.Marshal(map[string]any{"email": email, "exp": now.Add(webmailSSOTokenTTL).Unix()})
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + hex.EncodeToString(mac.Sum(nil))
}

// OpenMailboxWebmail -> GET /api/mailboxes/{id}/webmail
func (a *App) OpenMailboxWebmail(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	if a.WebmailSSOSecret == "" {
		writeError(w, http.StatusServiceUnavailable, "opening webmail from the dashboard is not configured on this server")
		return
	}
	if mailbox.Status != "active" {
		writeErrorCode(w, http.StatusForbidden, "MAILBOX_SUSPENDED", "this mailbox is suspended", "")
		return
	}
	email := mailbox.LocalPart + "@" + domain.Name
	a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
		"mailbox.webmail_opened", "mailbox", mailbox.ID, email, nil, requestIP(r))
	target := a.WebmailURL + "/?_task=login&_sso=" + url.QueryEscape(webmailSSOToken(a.WebmailSSOSecret, email, time.Now()))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Length", strconv.Itoa(0))
	http.Redirect(w, r, target, http.StatusFound)
}
