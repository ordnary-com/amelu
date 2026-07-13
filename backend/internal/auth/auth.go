// Package auth implements cookie-based session authentication for the
// dashboard. Sessions are stored server-side in Postgres; the cookie only
// carries an opaque random token (hashed before storage), never localStorage
// or client-readable state.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	CookieName    = "amelu_session"
	SessionTTL    = 7 * 24 * time.Hour
	tokenNumBytes = 32
)

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// NewSessionToken returns a fresh random token (to set as the cookie value)
// and its SHA-256 hash (what gets stored in the sessions table). We never
// store the raw token, mirroring how passwords are handled.
func NewSessionToken() (raw string, hash string, err error) {
	b := make([]byte, tokenNumBytes)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	hash = HashToken(raw)
	return raw, hash, nil
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func SetSessionCookie(w http.ResponseWriter, token string, expiresAt time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

var ErrNoSessionCookie = errors.New("no session cookie")

func TokenFromRequest(r *http.Request) (string, error) {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return "", ErrNoSessionCookie
	}
	if cookie.Value == "" {
		return "", ErrNoSessionCookie
	}
	return cookie.Value, nil
}
