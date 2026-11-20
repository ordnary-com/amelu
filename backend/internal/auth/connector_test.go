package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strings"
	"testing"
)

func TestVerifyPKCE(t *testing.T) {
	verifier := strings.Repeat("a", 50)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])

	if !VerifyPKCE(challenge, verifier) {
		t.Fatal("matching verifier rejected")
	}
	if VerifyPKCE(challenge, strings.Repeat("b", 50)) {
		t.Fatal("wrong verifier accepted")
	}
	if VerifyPKCE(challenge, "short") {
		t.Fatal("too-short verifier accepted")
	}
	if VerifyPKCE(verifier, verifier) {
		t.Fatal("plain challenge accepted")
	}
}

func TestConnectorTokenIsNotAnAPIKey(t *testing.T) {
	raw, _, err := NewConnectorToken(ConnectorAccessPrefix)
	if err != nil {
		t.Fatal(err)
	}
	r, _ := http.NewRequest("POST", "/mcp", nil)
	r.Header.Set("Authorization", "Bearer "+raw)

	if _, ok := ConnectorTokenFromRequest(r); !ok {
		t.Fatal("connector token not recognised")
	}
	if _, ok := APIKeyFromRequest(r); ok {
		t.Fatal("connector token must not authenticate as an API key")
	}
}
