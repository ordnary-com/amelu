package domainconnect

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"net/url"
	"strings"
	"testing"
)

// TestBuildApplyURL verifies the apply URL is well-formed and that its
// signature actually verifies against the matching public key — this is
// the one part of the Domain Connect flow we can fully validate without
// Cloudflare's template approval, since that's a pure crypto/encoding
// question independent of whether Cloudflare recognizes our template yet.
func TestBuildApplyURL(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	privPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})

	client, err := NewClient(Config{
		PrivateKeyPEM: string(privPEM),
		PubKeyDomain:  "amelu.org",
	})
	if err != nil {
		t.Fatal(err)
	}

	vars := RecordVars{
		Ed25519Selector: "v1-ed25519-20260711",
		Ed25519Key:      "abc123",
		RSASelector:     "v1-rsa-20260711",
		RSAKey:          "verylong+base64/key==",
	}

	applyURL, err := client.BuildApplyURL("https://dash.cloudflare.com/domainconnect", "example.com", "https://app.amelu.org/domains/123/dns", vars)
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(applyURL, "https://dash.cloudflare.com/domainconnect/v2/domainTemplates/providers/amelu.org/services/mailhosting/apply?") {
		t.Fatalf("unexpected apply URL prefix: %s", applyURL)
	}

	parsed, err := url.Parse(applyURL)
	if err != nil {
		t.Fatal(err)
	}
	q := parsed.Query()

	if q.Get("domain") != "example.com" {
		t.Errorf("domain = %q, want example.com", q.Get("domain"))
	}
	if q.Get("key") != "_dcpubkeyv1" {
		t.Errorf("key = %q, want _dcpubkeyv1", q.Get("key"))
	}
	if q.Get("rsakey") != vars.RSAKey {
		t.Errorf("rsakey not round-tripped correctly")
	}
	if !strings.Contains(parsed.RawQuery, "&key=_dcpubkeyv1&sig=") || strings.Contains(parsed.RawQuery[strings.Index(parsed.RawQuery, "&sig=")+1:], "&") {
		t.Errorf("key and sig must be the last parameters, sig last: %s", parsed.RawQuery)
	}

	sigB64 := q.Get("sig")
	if sigB64 == "" {
		t.Fatal("sig parameter missing")
	}
	sig, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		t.Fatalf("sig is not valid base64: %v", err)
	}

	// The signed bytes are the raw query string up to "&key=".
	signable := parsed.RawQuery[:strings.Index(parsed.RawQuery, "&key=")]
	hashed := sha256.Sum256([]byte(signable))

	if err := rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, hashed[:], sig); err != nil {
		t.Fatalf("signature does not verify: %v", err)
	}
}
