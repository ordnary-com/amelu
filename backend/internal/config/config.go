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

	// Stripe billing is optional in the same vein: absent, /api/billing/*
	// reports the feature unavailable instead of failing startup. Both must
	// be set together for webhooks to be verifiable.
	StripeSecretKey     string
	StripeWebhookSecret string

	// EXPIRATION_SWEEP_MODE is the Cloudflare-migration feature flag for the
	// mailbox expiration job (see docs/cloudflare/WORKFLOWS.md). "ticker"
	// (default) keeps today's in-process 15-minute goroutine. "external"
	// disables that goroutine entirely and expects an external trigger
	// (Cloudflare Worker Cron Trigger + Workflow) to call
	// POST /internal/jobs/expiration-sweep instead. Rollback is just
	// setting this back to "ticker" and restarting - no data migration
	// either direction, since both paths call the same
	// RunExpirationSweep/ListExpiredMailboxes logic.
	ExpirationSweepMode string

	// InternalJobsSharedSecret authenticates internal-only endpoints (see
	// auth.RequireInternal) called by Cloudflare Workers/Workflows over the
	// private Tunnel hostname. Empty means those endpoints refuse all
	// requests (fail closed), not that they run unauthenticated.
	InternalJobsSharedSecret string

	// OriginSharedSecret authenticates every request (see
	// handlers.EdgeAuth) as having passed through the edge Worker, not
	// hit the Tunnel hostname directly. Empty disables the check (today's
	// default - no Worker/Tunnel exists yet). Deliberately a separate
	// secret from InternalJobsSharedSecret - see docs/cloudflare/SECRETS.md.
	OriginSharedSecret string
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

		StripeSecretKey:     os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),

		ExpirationSweepMode:      getEnv("EXPIRATION_SWEEP_MODE", "ticker"),
		InternalJobsSharedSecret: os.Getenv("INTERNAL_JOBS_SHARED_SECRET"),
		OriginSharedSecret:       os.Getenv("ORIGIN_SHARED_SECRET"),
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

	if cfg.ExpirationSweepMode != "ticker" && cfg.ExpirationSweepMode != "external" {
		return nil, fmt.Errorf("EXPIRATION_SWEEP_MODE must be \"ticker\" or \"external\", got %q", cfg.ExpirationSweepMode)
	}
	if cfg.ExpirationSweepMode == "external" && cfg.InternalJobsSharedSecret == "" {
		return nil, fmt.Errorf("EXPIRATION_SWEEP_MODE=external requires INTERNAL_JOBS_SHARED_SECRET to be set")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
