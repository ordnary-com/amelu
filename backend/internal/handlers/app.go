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
	// invitees (e.g. https://app.amelu.org/reset-password/<token>).
	FrontendOrigin string
}
