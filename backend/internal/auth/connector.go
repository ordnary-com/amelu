package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"strings"
)

// Connector tokens are what an AI assistant holds after a customer approves
// it. The prefixes keep them recognisable to secret scanners, same idea as
// KeyPrefix, and distinct from API keys: auth.Require only accepts the
// latter, so a connector token can't reach anything but the MCP endpoint.
const (
	ConnectorAccessPrefix  = "amelu_mcp_"
	ConnectorRefreshPrefix = "amelu_rt_"
)

func NewConnectorToken(prefix string) (raw, hash string, err error) {
	b := make([]byte, tokenNumBytes)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = prefix + base64.RawURLEncoding.EncodeToString(b)
	return raw, HashToken(raw), nil
}

// NewAuthorizationCode returns a one-time code and its hash.
func NewAuthorizationCode() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, HashToken(raw), nil
}

func ConnectorTokenFromRequest(r *http.Request) (string, bool) {
	key, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	key = strings.TrimSpace(key)
	if !ok || !strings.HasPrefix(key, ConnectorAccessPrefix) {
		return "", false
	}
	return key, true
}

// VerifyPKCE checks an S256 code_challenge against the verifier presented at
// the token endpoint. Plain challenges are refused at authorization time.
func VerifyPKCE(challenge, verifier string) bool {
	if len(verifier) < 43 || len(verifier) > 128 {
		return false
	}
	sum := sha256.Sum256([]byte(verifier))
	want := base64.RawURLEncoding.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(want), []byte(challenge)) == 1
}
