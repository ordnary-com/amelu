package domainconnect

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// Settings is the response from a provider's Domain Connect settings
// endpoint. Field names and shape confirmed live against Cloudflare
// (api.cloudflare.com/client/v4/dns/domainconnect/v2/<domain>/settings)
// using a real Cloudflare-managed test domain.
type Settings struct {
	ProviderID      string `json:"providerId"`
	ProviderName    string `json:"providerName"`
	ProviderDisplay string `json:"providerDisplayName"`
	URLSyncUX       string `json:"urlSyncUX"`
	URLAsyncUX      string `json:"urlAsyncUX"`
	URLAPI          string `json:"urlAPI"`
}

// resolver bypasses whatever DNS server the host OS happens to have
// configured, in favor of a public resolver we know handles this correctly.
// Confirmed live: this domain's real _domainconnect TXT record resolved
// fine via 1.1.1.1 and 8.8.8.8 but intermittently failed ("no such host")
// through a residential ISP's default resolver — a discovery feature is
// only as good as its DNS lookups, so trusting the OS default here isn't
// good enough.
var resolver = &net.Resolver{
	PreferGo: true,
	Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
		d := net.Dialer{Timeout: 5 * time.Second}
		return d.DialContext(ctx, network, "1.1.1.1:53")
	},
}

// Discover runs the Domain Connect discovery steps for domain: look up the
// _domainconnect TXT record (confirmed live: Cloudflare publishes this as a
// bare "host/path" value with no scheme, e.g.
// "api.cloudflare.com/client/v4/dns/domainconnect", not a full URL), then
// fetch that host's settings endpoint for this specific domain.
func Discover(ctx context.Context, domain string) (*Settings, error) {
	apiRoot, err := lookupDomainConnectRecord(ctx, domain)
	if err != nil {
		return nil, err
	}

	settingsURL := fmt.Sprintf("https://%s/v2/%s/settings", strings.TrimSuffix(apiRoot, "/"), domain)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, settingsURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch domain connect settings: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("domain connect settings returned %s", resp.Status)
	}

	var settings Settings
	if err := json.NewDecoder(resp.Body).Decode(&settings); err != nil {
		return nil, fmt.Errorf("decode domain connect settings: %w", err)
	}
	return &settings, nil
}

// lookupDomainConnectRecord tries a CNAME first (the more common discovery
// mechanism per the spec), falling back to TXT — confirmed live that
// Cloudflare publishes TXT for this, not CNAME.
//
// Confirmed live: Go's net.Resolver.LookupCNAME never errors when no CNAME
// exists — it synthesizes the canonical name as the queried name itself, so
// a naive err == nil check treats every domain as having a CNAME. The fix
// is to require the result to actually differ from the query name.
func lookupDomainConnectRecord(ctx context.Context, domain string) (string, error) {
	name := "_domainconnect." + domain

	if cname, err := resolver.LookupCNAME(ctx, name); err == nil {
		trimmed := strings.TrimSuffix(cname, ".")
		if trimmed != "" && trimmed != name {
			return trimmed, nil
		}
	}

	txts, err := resolver.LookupTXT(ctx, name)
	if err != nil {
		return "", fmt.Errorf("no _domainconnect record for %s: %w", domain, err)
	}
	for _, txt := range txts {
		if txt != "" {
			return txt, nil
		}
	}
	return "", fmt.Errorf("empty _domainconnect TXT record for %s", domain)
}
