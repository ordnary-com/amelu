package auth

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
)

// KeyPrefix is the fixed head of every API key. It exists so a leaked key is
// recognisable as an Amelu credential in logs and secret scanners, and so the
// dashboard can show enough of a key to tell two apart without storing any
// part that would help forge one.
const KeyPrefix = "amelu_live_"

// prefixRandomChars is how much of the random tail is kept alongside the
// fixed prefix for display. Twelve of the 43 base64 characters is far too
// little to brute-force the rest from.
const prefixRandomChars = 6

// NewAPIKey returns a fresh key to hand to the caller once, its SHA-256 hash
// for storage, and the display prefix. Same rule as sessions: the raw key is
// never persisted.
func NewAPIKey() (raw string, hash string, prefix string, err error) {
	b := make([]byte, tokenNumBytes)
	if _, err = rand.Read(b); err != nil {
		return "", "", "", err
	}
	random := base64.RawURLEncoding.EncodeToString(b)
	raw = KeyPrefix + random
	return raw, HashToken(raw), KeyPrefix + random[:prefixRandomChars], nil
}

// APIKeyFromRequest pulls a key out of "Authorization: Bearer ...". Anything
// that isn't a bearer token carrying our prefix is reported as absent rather
// than as a bad key, so a request holding some other Authorization header
// still falls through to cookie auth.
func APIKeyFromRequest(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return "", false
	}
	key, ok := strings.CutPrefix(header, "Bearer ")
	if !ok {
		return "", false
	}
	key = strings.TrimSpace(key)
	if !strings.HasPrefix(key, KeyPrefix) {
		return "", false
	}
	return key, true
}
