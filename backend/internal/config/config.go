// Package config loads runtime configuration from environment variables.
// Nothing here is ever hardcoded; missing required values fail startup.
package config

import (
	"fmt"
	"os"
)

type Config struct {
	HTTPAddr string

	DatabaseURL string

	StalwartBaseURL  string
	StalwartUser     string
	StalwartPassword string

	CORSOrigin string

	// Domain Connect (Cloudflare "fix DNS automatically" flow) is optional:
	// until the template is approved by Cloudflare (see
	// internal/domainconnect), it's fine to run without these set. When
	// absent, the feature just reports unsupported rather than failing
	// startup.
	DomainConnectPrivateKey   string
	DomainConnectPubKeyDomain string
	DomainConnectRedirectURI  string

	// Password reset invite emails are optional too: absent, the "send
	// reset link" action just reports the feature unavailable rather than
	// failing startup - same convention as Domain Connect above.
	ResendAPIKey    string
	ResendFromEmail string
	ResendFromName  string
}

func Load() (*Config, error) {
	cfg := &Config{
		HTTPAddr:         getEnv("HTTP_ADDR", ":8081"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		StalwartBaseURL:  os.Getenv("STALWART_BASE_URL"),
		StalwartUser:     os.Getenv("STALWART_ADMIN_USER"),
		StalwartPassword: os.Getenv("STALWART_ADMIN_PASSWORD"),
		CORSOrigin:       getEnv("CORS_ORIGIN", "http://localhost:5173"),

		DomainConnectPrivateKey:   os.Getenv("DOMAIN_CONNECT_PRIVATE_KEY"),
		DomainConnectPubKeyDomain: os.Getenv("DOMAIN_CONNECT_PUBKEY_DOMAIN"),
		DomainConnectRedirectURI:  os.Getenv("DOMAIN_CONNECT_REDIRECT_URI"),

		ResendAPIKey:    os.Getenv("RESEND_API_KEY"),
		ResendFromEmail: getEnv("RESEND_FROM_EMAIL", "onboarding@ordnary.com"),
		ResendFromName:  getEnv("RESEND_FROM_NAME", "Amelu"),
	}

	var missing []string
	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if cfg.StalwartBaseURL == "" {
		missing = append(missing, "STALWART_BASE_URL")
	}
	if cfg.StalwartUser == "" {
		missing = append(missing, "STALWART_ADMIN_USER")
	}
	if cfg.StalwartPassword == "" {
		missing = append(missing, "STALWART_ADMIN_PASSWORD")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required environment variables: %v", missing)
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
