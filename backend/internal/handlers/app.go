// Package handlers implements the Go provisioning API's HTTP surface. It is
// the only thing the frontend talks to — Stalwart and Postgres are never
// exposed directly.
package handlers

import (
	"amelu/backend/internal/db"
	"amelu/backend/internal/domainconnect"
	"amelu/backend/internal/mailer"
	"amelu/backend/internal/ordnaryauth"
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

	// Mailer is nil when MAIL_RELAY_URL isn't configured (local dev without
	// the container network) - password reset and invite emails then report
	// unavailable instead of failing startup.
	Mailer *mailer.Client
	// FrontendOrigin is used to build the reset-link URL emailed to
	// invitees (e.g. https://app.amelu.org/reset-password/<token>), and the
	// success/cancel/return URLs for Stripe Checkout and the billing portal.
	FrontendOrigin string
	// FrontendOrigins are all dashboards allowed to call the API (the current
	// one first, then the 2.0 dashboard). Signing in through Ordnary returns
	// to whichever of these started it.
	FrontendOrigins []string

	// StripeEnabled is false when STRIPE_SECRET_KEY isn't configured -
	// billing handlers report unavailable rather than failing startup, same
	// convention as Mailer/DomainConnect above. StripeWebhookSecret verifies
	// incoming webhook payloads and is required whenever Stripe is enabled.
	StripeEnabled       bool
	StripeWebhookSecret string

	// InternalJobsSharedSecret is only used for logging/diagnostics here -
	// the actual verification happens in auth.RequireInternal, wrapped
	// around the route in cmd/api/main.go, same pattern as auth.Require for
	// customer sessions.
	InternalJobsSharedSecret string

	// Ordnary is nil until ORDNARY_ISSUER/CLIENT_ID/REDIRECT_URI/
	// COOKIE_SECRET are all set - "Login with Ordnary account" reports
	// unavailable rather than failing startup, same convention as
	// DomainConnect/Mailer/Stripe above. See internal/ordnaryauth.
	Ordnary *ordnaryauth.Config

	// WebmailURL and WebmailSSOSecret back "Open in webmail" (webmail_sso.go);
	// an empty secret reports unavailable.
	WebmailURL       string
	WebmailSSOSecret string
}
