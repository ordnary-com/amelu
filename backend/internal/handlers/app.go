// Package handlers implements the Go provisioning API's HTTP surface. It is
// the only thing the frontend talks to — Stalwart and Postgres are never
// exposed directly.
package handlers

import (
	"amelu/backend/internal/db"
	"amelu/backend/internal/domainconnect"
	"amelu/backend/internal/resend"
	"amelu/backend/internal/stalwart"
)

type App struct {
	Store        *db.Store
	Stalwart     *stalwart.Client
	CookieSecure bool

	// DomainConnect is nil until Cloudflare has approved the template (see
	// internal/domainconnect) — handlers must treat that as "unsupported",
	// not an error.
	DomainConnect *domainconnect.Client

	// Resend is nil when RESEND_API_KEY isn't configured — password reset
	// invite emails report unavailable rather than failing startup.
	Resend *resend.Client
	// FrontendOrigin is used to build the reset-link URL emailed to
	// invitees (e.g. https://app.amelu.org/reset-password/<token>), and the
	// success/cancel/return URLs for Stripe Checkout and the billing portal.
	FrontendOrigin string

	// StripeEnabled is false when STRIPE_SECRET_KEY isn't configured -
	// billing handlers report unavailable rather than failing startup, same
	// convention as Resend/DomainConnect above. StripeWebhookSecret verifies
	// incoming webhook payloads and is required whenever Stripe is enabled.
	StripeEnabled       bool
	StripeWebhookSecret string

	// InternalJobsSharedSecret is only used for logging/diagnostics here -
	// the actual verification happens in auth.RequireInternal, wrapped
	// around the route in cmd/api/main.go, same pattern as auth.Require for
	// customer sessions.
	InternalJobsSharedSecret string
}
