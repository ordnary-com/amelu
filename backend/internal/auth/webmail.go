package auth

import (
	"context"
	"net/http"
	"time"

	"amelu/backend/internal/db"
)

// Webmail sessions (docs/WEBMAIL.md) live next to the customer sessions but
// never mix with them: a different cookie, a different table, a different
// context key. A mailbox user holding a webmail cookie can't reach the
// dashboard API and vice versa.
const (
	WebmailCookieName = "amelu_webmail"
	WebmailSessionTTL = 30 * 24 * time.Hour
)

const webmailContextKey contextKey = 1

func SetWebmailCookie(w http.ResponseWriter, token string, expiresAt time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     WebmailCookieName,
		Value:    token,
		Path:     "/api/webmail",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearWebmailCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     WebmailCookieName,
		Value:    "",
		Path:     "/api/webmail",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func WebmailTokenFromRequest(r *http.Request) (string, bool) {
	cookie, err := r.Cookie(WebmailCookieName)
	if err != nil || cookie.Value == "" {
		return "", false
	}
	return cookie.Value, true
}

// RequireWebmail resolves the webmail cookie to its mailbox and attaches it
// to the request context; 401 otherwise.
func RequireWebmail(store *db.Store, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := WebmailTokenFromRequest(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized")
			return
		}
		user, err := store.GetWebmailSession(r.Context(), HashToken(token))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), webmailContextKey, user)))
	}
}

func WebmailUserFromContext(ctx context.Context) (*db.WebmailUser, bool) {
	u, ok := ctx.Value(webmailContextKey).(*db.WebmailUser)
	return u, ok
}
