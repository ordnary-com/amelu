// Package domainconnect implements the Domain Connect protocol
// (domainconnect.org) synchronous "apply" flow: instead of Amelu holding API
// credentials for a customer's DNS provider, the customer's browser is
// redirected to their own provider's consent page with a signed template of
// records; the provider applies them after the customer approves.
//
// IMPORTANT — external prerequisite not yet complete: Cloudflare (the only
// provider this package targets) requires the template JSON (see
// template.json in this directory) to be submitted as a PR to
// github.com/Domain-Connect/templates, merged, and then Cloudflare emailed
// at domain-connect@cloudflare.com to actually enable the apply flow for
// end users. Until that happens, discovery and URL-building below work and
// have been verified against Cloudflare's real discovery API (see
// discovery.go), but an apply attempt will be rejected by Cloudflare with an
// unrecognized-template error. Signature construction follows the published
// spec (github.com/Domain-Connect/spec) but has NOT been verified against a
// live accepted apply, since that requires the onboarding above to finish
// first.
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
	// PubKeyDomain is where the matching public key is published as a DNS
	// TXT record at _dcpubkeyv1.<PubKeyDomain>, per the Domain Connect spec.
	PubKeyDomain string
	// RedirectURI is where Cloudflare sends the customer's browser back to
	// after they approve or decline the template.
	RedirectURI string
}

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
// at apply time. Everything that could differ between domains (DKIM keys,
// selectors that embed the current date, DMARC/report addresses) is passed
// explicitly here rather than reconstructed from a formula, so Stalwart's
// live zone file stays the single source of truth.
type RecordVars struct {
	Ed25519Selector string // e.g. "v1-ed25519-20260711._domainkey"
	Ed25519Value    string
	RSASelector     string // e.g. "v1-rsa-20260711._domainkey"
	RSAValue        string
	DMARCValue      string
	MTASTSValue     string
	TLSRPTValue     string
	UAAutoConfValue string
}

// BuildApplyURL constructs the signed synchronous "apply" redirect URL for
// domain, given the sync UX host from discovery (settings.urlSyncUX) and
// the domain's current record values.
func (c *Client) BuildApplyURL(syncUX, domain string, vars RecordVars) (string, error) {
	base := fmt.Sprintf("%s/v2/domainTemplates/providers/%s/services/%s/apply", strings.TrimRight(syncUX, "/"), ProviderID, ServiceID)

	params := url.Values{}
	params.Set("domain", domain)
	params.Set("redirect_uri", c.cfg.RedirectURI)
	params.Set("DCE_ED25519_SELECTOR", vars.Ed25519Selector)
	params.Set("DCE_ED25519_VALUE", vars.Ed25519Value)
	params.Set("DCE_RSA_SELECTOR", vars.RSASelector)
	params.Set("DCE_RSA_VALUE", vars.RSAValue)
	params.Set("DCE_DMARC_VALUE", vars.DMARCValue)
	params.Set("DCE_MTA_STS_VALUE", vars.MTASTSValue)
	params.Set("DCE_TLSRPT_VALUE", vars.TLSRPTValue)
	params.Set("DCE_UA_AUTOCONF_VALUE", vars.UAAutoConfValue)
	params.Set("key", "_dcpubkeyv1."+c.cfg.PubKeyDomain)

	// Signature covers the full query string exactly as it will be sent,
	// excluding "sig" (not yet computed) and "key" (per spec, both are
	// excluded from the signed content though "key" stays in the final URL).
	signable := encodeSorted(params, "key")
	sig, err := c.sign(signable)
	if err != nil {
		return "", fmt.Errorf("domain connect: sign apply url: %w", err)
	}

	// "key" must be present in the final URL; "sig" must be the last param.
	final := encodeSorted(params, "") + "&sig=" + url.QueryEscape(sig)
	return base + "?" + final, nil
}

// encodeSorted url-encodes params in sorted key order (deterministic, so
// signer and verifier compute the same byte string), optionally omitting a
// key entirely.
func encodeSorted(params url.Values, omit string) string {
	filtered := url.Values{}
	for k, v := range params {
		if k == omit {
			continue
		}
		filtered[k] = v
	}
	return filtered.Encode()
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
