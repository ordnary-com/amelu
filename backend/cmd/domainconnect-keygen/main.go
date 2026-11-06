// Command domainconnect-keygen generates the RSA keypair used to sign
// Domain Connect apply URLs (see internal/domainconnect). Run it once:
//
//	go run ./cmd/domainconnect-keygen
//
// It prints the private key PEM (save it as DOMAIN_CONNECT_PRIVATE_KEY) and
// the exact DNS TXT record to publish so Cloudflare (and any other Domain
// Connect provider) can verify signatures made with it.
package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"flag"
	"fmt"

	"amelu/backend/internal/domainconnect"
)

func main() {
	pubKeyDomain := flag.String("pubkey-domain", "amelu.org", "domain the public key TXT record will be published under")
	flag.Parse()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}

	privDER := x509.MarshalPKCS1PrivateKey(key)
	privPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: privDER})

	pubDER, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		panic(err)
	}
	pubB64 := base64.StdEncoding.EncodeToString(pubDER)

	fmt.Println("=== Save this as the DOMAIN_CONNECT_PRIVATE_KEY environment variable (keep it secret) ===")
	fmt.Println()
	fmt.Print(string(privPEM))
	fmt.Println()
	// A single TXT string is capped at 255 bytes, so the key is split over
	// several records, numbered with p= as the spec describes.
	fmt.Println("=== Publish these DNS TXT records (public, safe to publish) ===")
	fmt.Println()
	fmt.Printf("Name:  %s.%s\n", domainconnect.PubKeyHost, *pubKeyDomain)
	fmt.Printf("Type:  TXT\n")
	for i := 0; i*200 < len(pubB64); i++ {
		fmt.Printf("Value: p=%d,a=RS256,d=%s\n", i+1, pubB64[i*200:min((i+1)*200, len(pubB64))])
	}
	fmt.Println()
	fmt.Println("Set DOMAIN_CONNECT_PUBKEY_DOMAIN to the domain above once the record is live.")
}
