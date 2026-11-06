package domainconnect

import (
	"context"
	"net"
	"net/url"
	"strings"
)

// Provider is the DNS host a domain's nameservers point at, so the
// dashboard can say where to add records when automatic setup isn't
// available.
type Provider struct {
	Name string `json:"name"`
	// DNSURL opens the provider's DNS management, empty when there's no
	// stable link to it.
	DNSURL string `json:"dnsUrl,omitempty"`
}

type knownProvider struct {
	nsSuffix string
	name     string
	// dnsURL may contain {domain}.
	dnsURL string
}

var knownProviders = []knownProvider{
	{"ns.cloudflare.com", "Cloudflare", "https://dash.cloudflare.com/"},
	{"domaincontrol.com", "GoDaddy", "https://dcc.godaddy.com/control/dnsmanagement?domainName={domain}"},
	{"registrar-servers.com", "Namecheap", "https://ap.www.namecheap.com/domains/domaincontrolpanel/{domain}/advancedns"},
	{"transip.net", "TransIP", "https://www.transip.nl/cp/domein-hosting/"},
	{"transip.nl", "TransIP", "https://www.transip.nl/cp/domein-hosting/"},
	{"transip.eu", "TransIP", "https://www.transip.nl/cp/domein-hosting/"},
	{"ui-dns.com", "IONOS", "https://my.ionos.com/domains"},
	{"ui-dns.de", "IONOS", "https://my.ionos.com/domains"},
	{"ui-dns.org", "IONOS", "https://my.ionos.com/domains"},
	{"ui-dns.biz", "IONOS", "https://my.ionos.com/domains"},
	{"hetzner.com", "Hetzner", "https://dns.hetzner.com/"},
	{"hetzner.de", "Hetzner", "https://dns.hetzner.com/"},
	{"digitalocean.com", "DigitalOcean", "https://cloud.digitalocean.com/networking/domains"},
	{"vercel-dns.com", "Vercel", "https://vercel.com/dashboard/domains"},
	{"ovh.net", "OVHcloud", "https://www.ovh.com/manager/"},
	{"ovh.ca", "OVHcloud", "https://www.ovh.com/manager/"},
	{"googledomains.com", "Google Cloud DNS", "https://console.cloud.google.com/net-services/dns/zones"},
	{"azure-dns.com", "Azure DNS", "https://portal.azure.com/"},
	{"azure-dns.net", "Azure DNS", "https://portal.azure.com/"},
	{"azure-dns.org", "Azure DNS", "https://portal.azure.com/"},
	{"azure-dns.info", "Azure DNS", "https://portal.azure.com/"},
	{"squarespacedns.com", "Squarespace", "https://account.squarespace.com/domains"},
	{"porkbun.com", "Porkbun", "https://porkbun.com/account/domainsSpeedy"},
	{"gandi.net", "Gandi", "https://admin.gandi.net/"},
	{"hostnet.nl", "Hostnet", ""},
	{"mijndomein.nl", "Mijndomein", ""},
	{"strato.de", "Strato", ""},
	{"one.com", "one.com", ""},
	{"vimexx.nl", "Vimexx", ""},
	{"versio.nl", "Versio", ""},
	{"hostinger.com", "Hostinger", ""},
	{"dns-parking.com", "Hostinger", ""},
	{"name.com", "Name.com", ""},
	{"dnsimple.com", "DNSimple", ""},
	{"dnsmadeeasy.com", "DNS Made Easy", ""},
	{"nsone.net", "NS1", ""},
}

// DetectProvider names the DNS host behind domain's nameservers, walking up
// to the zone apex for a subdomain. Returns nil when the nameservers are
// unknown or can't be resolved.
func DetectProvider(ctx context.Context, domain string) *Provider {
	name := strings.TrimSuffix(domain, ".")
	for strings.Contains(name, ".") {
		nss, err := resolver.LookupNS(ctx, name)
		if err == nil && len(nss) > 0 {
			return matchProvider(nss, name)
		}
		name = name[strings.Index(name, ".")+1:]
	}
	return nil
}

func matchProvider(nss []*net.NS, zone string) *Provider {
	for _, ns := range nss {
		host := strings.ToLower(strings.TrimSuffix(ns.Host, "."))
		// Route 53 nameservers are awsdns-NN.com/.net/.org/.co.uk.
		if strings.Contains(host, ".awsdns-") {
			return &Provider{Name: "Amazon Route 53", DNSURL: "https://console.aws.amazon.com/route53/v2/hostedzones"}
		}
		for _, p := range knownProviders {
			if host == p.nsSuffix || strings.HasSuffix(host, "."+p.nsSuffix) {
				return &Provider{Name: p.name, DNSURL: strings.ReplaceAll(p.dnsURL, "{domain}", url.PathEscape(zone))}
			}
		}
	}
	return nil
}
