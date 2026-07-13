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
		RedirectURI:   "https://app.amelu.org/domains/123/dns",
	})
	if err != nil {
		t.Fatal(err)
	}

	vars := RecordVars{
		Ed25519Selector: "v1-ed25519-20260711._domainkey",
		Ed25519Value:    "v=DKIM1; k=ed25519; h=sha256; p=abc123",
		RSASelector:     "v1-rsa-20260711._domainkey",
		RSAValue:        "v=DKIM1; k=rsa; h=sha256; p=verylongbase64key",
		DMARCValue:      "v=DMARC1; p=reject; rua=mailto:postmaster@example.com",
		MTASTSValue:     "v=STSv1; id=123456",
		TLSRPTValue:     "v=TLSRPTv1; rua=mailto:postmaster@example.com",
		UAAutoConfValue: "v=UAAC1; a=sha256; d=abcdef",
	}

	applyURL, err := client.BuildApplyURL("https://dash.cloudflare.com/domainconnect", "example.com", vars)
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
	if q.Get("key") != "_dcpubkeyv1.amelu.org" {
		t.Errorf("key = %q, want _dcpubkeyv1.amelu.org", q.Get("key"))
	}
	if q.Get("DCE_RSA_VALUE") != vars.RSAValue {
		t.Errorf("DCE_RSA_VALUE not round-tripped correctly")
	}

	sigB64 := q.Get("sig")
	if sigB64 == "" {
		t.Fatal("sig parameter missing")
	}
	sig, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		t.Fatalf("sig is not valid base64: %v", err)
	}

	// Recompute what should have been signed (everything except sig and
	// key) and verify against the public key, proving sign+verify agree on
	// the same canonical string.
	withoutSigOrKey := url.Values{}
	for k, v := range q {
		if k == "sig" || k == "key" {
			continue
		}
		withoutSigOrKey[k] = v
	}
	signable := withoutSigOrKey.Encode()
	hashed := sha256.Sum256([]byte(signable))

	if err := rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, hashed[:], sig); err != nil {
		t.Fatalf("signature does not verify: %v", err)
	}
}
