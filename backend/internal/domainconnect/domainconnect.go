// Package domainconnect implements the Domain Connect protocol
// (domainconnect.org) synchronous "apply" flow: instead of Amelu holding API
// credentials for a customer's DNS provider, the customer's browser is
// redirected to their own provider's consent page with a signed template of
// records; the provider applies them after the customer approves.
//
// Cloudflare (the only provider this package targets) only accepts the
// apply flow for templates merged into github.com/Domain-Connect/templates
// and then onboarded via domain-connect@cloudflare.com; until then apply
// attempts are rejected with an unrecognized-template error.
package domainconnect

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net/url"
	"strings"
)

// ProviderID is the id we authored the template under, submitted to
// Cloudflare's template repo.
const ProviderID = "amelu.org"

// ServiceID must match the serviceId used in template.json.
const ServiceID = "mailhosting"

type Config struct {
	// PrivateKeyPEM is the RSA private key (PKCS#1 or PKCS#8 PEM) used to
	// sign apply URLs, generated once via cmd/domainconnect-keygen.
	PrivateKeyPEM string
	// PubKeyDomain is where the matching public key is published as DNS TXT
	// records at <PubKeyHost>.<PubKeyDomain>. It must equal the template's
	// syncPubKeyDomain.
	PubKeyDomain string
}

// PubKeyHost is the "key" query parameter: the label under PubKeyDomain
// holding the public key. A new label (_dcpubkeyv2) is how a key rotates.
const PubKeyHost = "_dcpubkeyv1"

// Client signs and builds Domain Connect apply URLs.
type Client struct {
	cfg        Config
	privateKey *rsa.PrivateKey
}

func NewClient(cfg Config) (*Client, error) {
	block, _ := pem.Decode([]byte(cfg.PrivateKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("domain connect: could not decode private key PEM")
	}

	key, err := parseRSAPrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("domain connect: parse private key: %w", err)
	}

	return &Client{cfg: cfg, privateKey: key}, nil
}

func parseRSAPrivateKey(der []byte) (*rsa.PrivateKey, error) {
	if key, err := x509.ParsePKCS1PrivateKey(der); err == nil {
		return key, nil
	}
	keyAny, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, err
	}
	key, ok := keyAny.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("private key is not RSA")
	}
	return key, nil
}

// RecordVars are the domain-specific values substituted into template.json
// at apply time. Stalwart's live zone file stays the source of truth for
// them; everything else in the template is fixed.
type RecordVars struct {
	Ed25519Selector string // e.g. "v1-ed25519-20260711", without "._domainkey"
	Ed25519Key      string // the DKIM p= value
	RSASelector     string
	RSAKey          string
}

// BuildApplyURL constructs the signed synchronous "apply" redirect URL for
// domain, given the sync UX host from discovery (settings.urlSyncUX), the
// domain's current record values, and where to send the browser afterwards.
func (c *Client) BuildApplyURL(syncUX, domain, redirectURI string, vars RecordVars) (string, error) {
	base := fmt.Sprintf("%s/v2/domainTemplates/providers/%s/services/%s/apply", strings.TrimRight(syncUX, "/"), ProviderID, ServiceID)

	params := url.Values{}
	params.Set("domain", domain)
	params.Set("redirect_uri", redirectURI)
	params.Set("ed25519selector", vars.Ed25519Selector)
	params.Set("ed25519key", vars.Ed25519Key)
	params.Set("rsaselector", vars.RSASelector)
	params.Set("rsakey", vars.RSAKey)

	// The signature covers the query string without key and sig; Cloudflare
	// additionally requires sig to be the very last parameter.
	signable := params.Encode()
	sig, err := c.sign(signable)
	if err != nil {
		return "", fmt.Errorf("domain connect: sign apply url: %w", err)
	}
	return base + "?" + signable + "&key=" + PubKeyHost + "&sig=" + url.QueryEscape(sig), nil
}

func (c *Client) sign(data string) (string, error) {
	hashed := sha256.Sum256([]byte(data))
	sig, err := rsa.SignPKCS1v15(rand.Reader, c.privateKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

// Supported checks (via live discovery) whether domain's DNS provider
// supports Domain Connect and specifically recognizes our provider id. Any
// discovery failure (no record published, network error, provider doesn't
// implement it) is treated as simply "not supported" rather than an error —
// per the product decision, the "fix automatically" button should only
// appear when this returns true, never show as broken for the common case
// of a domain whose provider doesn't support this at all.
func Supported(ctx context.Context, domain string) (*Settings, bool) {
	settings, err := Discover(ctx, domain)
	if err != nil {
		return nil, false
	}
	return settings, settings.ProviderID == "cloudflare.com"
}
