package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestWebmailSSOToken(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	tok := webmailSSOToken("s3cret", "someone@example.com", now)
	parts := strings.SplitN(tok, ".", 2)
	if len(parts) != 2 {
		t.Fatalf("token = %q", tok)
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		t.Fatal(err)
	}
	var claims struct {
		Email string `json:"email"`
		Exp   int64  `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		t.Fatal(err)
	}
	if claims.Email != "someone@example.com" || claims.Exp != now.Unix()+60 {
		t.Fatalf("claims = %+v", claims)
	}
	mac := hmac.New(sha256.New, []byte("s3cret"))
	mac.Write(payload)
	if hex.EncodeToString(mac.Sum(nil)) != parts[1] {
		t.Fatal("signature does not verify")
	}
}
