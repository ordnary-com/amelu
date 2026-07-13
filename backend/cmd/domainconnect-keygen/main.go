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
	fmt.Println("=== Publish this DNS TXT record (public, safe to publish) ===")
	fmt.Println()
	fmt.Printf("Name:  _dcpubkeyv1.%s\n", *pubKeyDomain)
	fmt.Printf("Type:  TXT\n")
	fmt.Printf("Value: p=1,a=RS256,d=%s\n", pubB64)
	fmt.Println()
	fmt.Println("Set DOMAIN_CONNECT_PUBKEY_DOMAIN to the domain above once the record is live.")
}
