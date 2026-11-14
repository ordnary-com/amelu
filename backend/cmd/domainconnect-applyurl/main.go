// Command domainconnect-applyurl prints a signed Domain Connect apply URL for
// any domain, to test the template at the domain's DNS provider without the
// dashboard or a production secret:
//
//	DOMAIN_CONNECT_PRIVATE_KEY="$(security find-generic-password -a amelu -s "amelu DOMAIN_CONNECT_PRIVATE_KEY" -w | base64 -d)" \
//	  go run ./cmd/domainconnect-applyurl -domain test.example -groups mail,dmarc
//
// DKIM keys left empty are throwaway keys generated on the spot; the RSA one
// is 2048 bits, so its TXT record is longer than 255 characters.
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"amelu/backend/internal/domainconnect"
)

func main() {
	domain := flag.String("domain", "", "domain to apply the template to")
	groups := flag.String("groups", "", "comma-separated template groups to apply (empty: all)")
	redirect := flag.String("redirect", "https://app.amelu.org/domains", "where the provider sends the browser afterwards")
	date := time.Now().Format("20060102")
	ed25519Selector := flag.String("ed25519selector", "test-ed25519-"+date, "Ed25519 DKIM selector")
	ed25519Key := flag.String("ed25519key", "", "Ed25519 DKIM public key (empty: throwaway)")
	rsaSelector := flag.String("rsaselector", "test-rsa-"+date, "RSA DKIM selector")
	rsaKey := flag.String("rsakey", "", "RSA DKIM public key (empty: throwaway)")
	flag.Parse()

	if *domain == "" {
		fail("-domain is required")
	}
	client, err := domainconnect.NewClient(domainconnect.Config{PrivateKeyPEM: os.Getenv("DOMAIN_CONNECT_PRIVATE_KEY"), PubKeyDomain: "amelu.org"})
	if err != nil {
		fail(err.Error() + " (set DOMAIN_CONNECT_PRIVATE_KEY)")
	}

	if *ed25519Key == "" {
		pub, _, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			fail(err.Error())
		}
		*ed25519Key = base64.StdEncoding.EncodeToString(pub)
	}
	if *rsaKey == "" {
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			fail(err.Error())
		}
		der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
		if err != nil {
			fail(err.Error())
		}
		*rsaKey = base64.StdEncoding.EncodeToString(der)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	settings, err := domainconnect.Discover(ctx, *domain)
	if err != nil {
		fail("discovery: " + err.Error())
	}

	var groupList []string
	if *groups != "" {
		groupList = strings.Split(*groups, ",")
	}
	applyURL, err := client.BuildApplyURL(settings.URLSyncUX, *domain, *redirect, domainconnect.RecordVars{
		Ed25519Selector: *ed25519Selector,
		Ed25519Key:      *ed25519Key,
		RSASelector:     *rsaSelector,
		RSAKey:          *rsaKey,
	}, groupList)
	if err != nil {
		fail(err.Error())
	}
	fmt.Fprintf(os.Stderr, "DNS provider: %s (%s)\n", settings.ProviderName, settings.ProviderID)
	fmt.Println(applyURL)
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "domainconnect-applyurl:", msg)
	os.Exit(1)
}
