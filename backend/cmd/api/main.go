package main

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/config"
	"amelu/backend/internal/db"
	"amelu/backend/internal/domainconnect"
	"amelu/backend/internal/handlers"
	"amelu/backend/internal/resend"
	"amelu/backend/internal/stalwart"

	"github.com/stripe/stripe-go/v81"
)

// runExpirationSweepSafely recovers from any panic in the sweep so a bug
// there can't crash the whole API process - it just logs and waits for the
// next tick.
func runExpirationSweepSafely(app *handlers.App) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("expiration sweep: recovered from panic: %v", r)
		}
	}()
	app.RunExpirationSweep(context.Background())
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	conn, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer conn.Close()

	if err := db.Migrate(context.Background(), conn); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	app := &handlers.App{
		Store:                    db.NewStore(conn),
		Stalwart:                 stalwart.NewClient(cfg.StalwartBaseURL, cfg.StalwartUser, cfg.StalwartPassword),
		CookieSecure:             strings.HasPrefix(cfg.CORSOrigin, "https://"),
		FrontendOrigin:           cfg.CORSOrigin,
		InternalJobsSharedSecret: cfg.InternalJobsSharedSecret,
	}

	if cfg.DomainConnectPrivateKey != "" {
		dcClient, err := domainconnect.NewClient(domainconnect.Config{
			PrivateKeyPEM: cfg.DomainConnectPrivateKey,
			PubKeyDomain:  cfg.DomainConnectPubKeyDomain,
			RedirectURI:   cfg.DomainConnectRedirectURI,
		})
		if err != nil {
			log.Fatalf("domain connect: %v", err)
		}
		app.DomainConnect = dcClient
	} else {
		log.Printf("domain connect: DOMAIN_CONNECT_PRIVATE_KEY not set, \"fix automatically\" will report unsupported for every domain")
	}

	if cfg.ResendAPIKey != "" {
		app.Resend = resend.NewClient(cfg.ResendAPIKey, cfg.ResendFromEmail, cfg.ResendFromName)
	} else {
		log.Printf("resend: RESEND_API_KEY not set, password reset invite emails will report unavailable")
	}

	if cfg.StripeSecretKey != "" && cfg.StripeWebhookSecret != "" {
		stripe.Key = cfg.StripeSecretKey
		app.StripeEnabled = true
		app.StripeWebhookSecret = cfg.StripeWebhookSecret
	} else {
		log.Printf("stripe: STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET not set, billing will report unavailable")
	}

	// Mailbox expiration has no native Stalwart mechanism - this ticker is
	// Amelu's own stand-in, sweeping for due expirations every 15 minutes.
	// Wrapped in its own recover so a panic here can't take down the whole
	// API process. EXPIRATION_SWEEP_MODE=external disables this goroutine
	// in favor of an outside trigger calling
	// POST /internal/jobs/expiration-sweep instead (see
	// docs/cloudflare/WORKFLOWS.md) - config.Load already rejects any other
	// value, so this is the only place that needs to branch on it.
	if cfg.ExpirationSweepMode == "ticker" {
		go func() {
			ticker := time.NewTicker(15 * time.Minute)
			defer ticker.Stop()
			for range ticker.C {
				runExpirationSweepSafely(app)
			}
		}()
	} else {
		log.Printf("expiration sweep: in-process ticker disabled (EXPIRATION_SWEEP_MODE=external), expecting external trigger")
	}

	mux := http.NewServeMux()

	// Public, unauthenticated, no DB/Stalwart dependency - polled by the
	// Cloudflare Tunnel connector and the edge Worker's origin health
	// check. See docs/cloudflare/TUNNEL.md and EDGE_WORKER.md.
	mux.HandleFunc("GET /api/healthz", app.Healthz)

	// Internal-only: HMAC-signed shared secret (auth.RequireInternal), and
	// must never be routed to by the public edge Worker or exposed outside
	// the private Tunnel hostname - see docs/cloudflare/WORKFLOWS.md and
	// SECURITY.md. Not a customer session endpoint.
	mux.HandleFunc("POST /internal/jobs/expiration-sweep", auth.RequireInternal(cfg.InternalJobsSharedSecret, app.RunExpirationSweepJob))

	mux.HandleFunc("POST /api/signup", app.Signup)
	mux.HandleFunc("POST /api/login", app.Login)
	mux.HandleFunc("POST /api/logout", app.Logout)
	mux.HandleFunc("GET /api/me", auth.Require(app.Store, app.Me))

	mux.HandleFunc("GET /api/account", auth.Require(app.Store, app.Me))
	mux.HandleFunc("PATCH /api/account/name", auth.Require(app.Store, app.UpdateAccountName))
	mux.HandleFunc("PATCH /api/account/profile", auth.Require(app.Store, app.UpdateAccountProfile))
	mux.HandleFunc("PATCH /api/account/email", auth.Require(app.Store, app.UpdateAccountEmail))
	mux.HandleFunc("PATCH /api/account/password", auth.Require(app.Store, app.UpdateAccountPassword))
	mux.HandleFunc("DELETE /api/account", auth.Require(app.Store, app.TerminateAccount))

	mux.HandleFunc("POST /api/domains", auth.Require(app.Store, app.CreateDomain))
	mux.HandleFunc("GET /api/domains", auth.Require(app.Store, app.ListDomains))
	mux.HandleFunc("DELETE /api/domains/{id}", auth.Require(app.Store, app.DeleteDomain))
	mux.HandleFunc("GET /api/domains/{id}/dns", auth.Require(app.Store, app.GetDomainDNS))
	mux.HandleFunc("GET /api/domains/{id}/domain-connect", auth.Require(app.Store, app.GetDomainConnect))
	mux.HandleFunc("GET /api/domains/{id}/bind", auth.Require(app.Store, app.GetDomainBindFile))

	mux.HandleFunc("GET /api/domains/{id}/activity", auth.Require(app.Store, app.GetActivity))
	mux.HandleFunc("PATCH /api/domains/{id}/notes", auth.Require(app.Store, app.UpdateDomainNotes))
	mux.HandleFunc("PATCH /api/domains/{id}/listing", auth.Require(app.Store, app.UpdateDomainListing))
	mux.HandleFunc("POST /api/domains/{id}/transfer", auth.Require(app.Store, app.TransferDomain))
	mux.HandleFunc("POST /api/domains/{id}/deactivate", auth.Require(app.Store, app.DeactivateDomain))
	mux.HandleFunc("POST /api/domains/{id}/reactivate", auth.Require(app.Store, app.ReactivateDomain))

	mux.HandleFunc("GET /api/domains/{id}/aliases", auth.Require(app.Store, app.ListDomainAliases))
	mux.HandleFunc("POST /api/domains/{id}/aliases", auth.Require(app.Store, app.CreateDomainAlias))
	mux.HandleFunc("DELETE /api/domains/{id}/aliases/{alias}", auth.Require(app.Store, app.DeleteDomainAlias))

	mux.HandleFunc("GET /api/domains/{id}/catchall", auth.Require(app.Store, app.GetCatchAll))
	mux.HandleFunc("PUT /api/domains/{id}/catchall", auth.Require(app.Store, app.UpdateCatchAll))

	mux.HandleFunc("GET /api/domains/{id}/address-aliases", auth.Require(app.Store, app.ListAddressAliases))
	mux.HandleFunc("POST /api/domains/{id}/address-aliases", auth.Require(app.Store, app.CreateAddressAlias))
	mux.HandleFunc("DELETE /api/mailboxes/{mailboxId}/address-aliases/{index}", auth.Require(app.Store, app.DeleteAddressAlias))
	mux.HandleFunc("GET /api/domains/{id}/address-aliases/export", auth.Require(app.Store, app.ExportAddressAliasesCSV))
	mux.HandleFunc("POST /api/domains/{id}/address-aliases/import", auth.Require(app.Store, app.ImportAddressAliasesCSV))

	mux.HandleFunc("GET /api/domains/{id}/rewrites", auth.Require(app.Store, app.ListPatternRewrites))
	mux.HandleFunc("POST /api/domains/{id}/rewrites", auth.Require(app.Store, app.CreatePatternRewrite))
	mux.HandleFunc("DELETE /api/domains/{id}/rewrites/{ruleId}", auth.Require(app.Store, app.DeletePatternRewrite))

	mux.HandleFunc("GET /api/domains/{id}/bccs", auth.Require(app.Store, app.ListBccCaptures))
	mux.HandleFunc("POST /api/domains/{id}/bccs", auth.Require(app.Store, app.CreateBccCapture))
	mux.HandleFunc("DELETE /api/domains/{id}/bccs/{ruleId}", auth.Require(app.Store, app.DeleteBccCapture))

	mux.HandleFunc("GET /api/domains/{id}/spam/overview", auth.Require(app.Store, app.GetSpamOverview))
	mux.HandleFunc("GET /api/domains/{id}/spam/subject-settings", auth.Require(app.Store, app.GetSpamSubjectSettings))
	mux.HandleFunc("PUT /api/domains/{id}/spam/subject-settings", auth.Require(app.Store, app.UpdateSpamSubjectSettings))
	mux.HandleFunc("GET /api/domains/{id}/spam/sender-lists", auth.Require(app.Store, app.GetSpamSenderLists))
	mux.HandleFunc("PUT /api/domains/{id}/spam/sender-lists", auth.Require(app.Store, app.UpdateSpamSenderLists))
	mux.HandleFunc("GET /api/domains/{id}/spam/recipient-denylist", auth.Require(app.Store, app.GetSpamRecipientDenylist))
	mux.HandleFunc("PUT /api/domains/{id}/spam/recipient-denylist", auth.Require(app.Store, app.UpdateSpamRecipientDenylist))

	mux.HandleFunc("POST /api/domains/{domainId}/mailboxes", auth.Require(app.Store, app.CreateMailbox))
	mux.HandleFunc("GET /api/domains/{domainId}/mailboxes", auth.Require(app.Store, app.ListMailboxes))
	mux.HandleFunc("GET /api/domains/{id}/mailboxes/export", auth.Require(app.Store, app.ExportMailboxesCSV))
	mux.HandleFunc("POST /api/domains/{id}/mailboxes/import", auth.Require(app.Store, app.ImportMailboxesCSV))
	mux.HandleFunc("GET /api/domains/{id}/mailboxes/default-services", auth.Require(app.Store, app.GetDomainDefaultServices))
	mux.HandleFunc("PUT /api/domains/{id}/mailboxes/default-services", auth.Require(app.Store, app.UpdateDomainDefaultServices))
	mux.HandleFunc("GET /api/domains/{id}/mailboxes/default-limits", auth.Require(app.Store, app.GetDomainDefaultLimits))
	mux.HandleFunc("PUT /api/domains/{id}/mailboxes/default-limits", auth.Require(app.Store, app.UpdateDomainDefaultLimits))
	mux.HandleFunc("GET /api/mailboxes/{id}", auth.Require(app.Store, app.GetMailbox))
	mux.HandleFunc("PATCH /api/mailboxes/{id}/name", auth.Require(app.Store, app.UpdateMailboxName))
	mux.HandleFunc("DELETE /api/mailboxes/{id}", auth.Require(app.Store, app.DeleteMailbox))
	mux.HandleFunc("POST /api/mailboxes/{id}/suspend", auth.Require(app.Store, app.SuspendMailbox))
	mux.HandleFunc("POST /api/mailboxes/{id}/activate", auth.Require(app.Store, app.ActivateMailbox))

	mux.HandleFunc("GET /api/mailboxes/{id}/activity", auth.Require(app.Store, app.GetMailboxActivity))
	mux.HandleFunc("GET /api/mailboxes/{id}/logs", auth.Require(app.Store, app.GetMailboxRecentLogs))

	mux.HandleFunc("GET /api/mailboxes/{id}/services", auth.Require(app.Store, app.GetMailboxServices))
	mux.HandleFunc("PUT /api/mailboxes/{id}/services", auth.Require(app.Store, app.UpdateMailboxServices))

	mux.HandleFunc("POST /api/mailboxes/{id}/password", auth.Require(app.Store, app.SetMailboxPassword))
	mux.HandleFunc("POST /api/mailboxes/{id}/password/invite", auth.Require(app.Store, app.InviteMailboxPassword))

	// Public - the recipient of a reset link isn't logged into Amelu.
	mux.HandleFunc("GET /api/password-reset/{token}", app.GetPasswordResetToken)
	mux.HandleFunc("POST /api/password-reset/{token}", app.CompletePasswordReset)

	mux.HandleFunc("GET /api/mailboxes/{id}/internal-access", auth.Require(app.Store, app.GetMailboxInternalAccess))
	mux.HandleFunc("PUT /api/mailboxes/{id}/internal-access", auth.Require(app.Store, app.UpdateMailboxInternalAccess))

	mux.HandleFunc("GET /api/mailboxes/{id}/identities", auth.Require(app.Store, app.ListMailboxIdentities))
	mux.HandleFunc("POST /api/mailboxes/{id}/identities", auth.Require(app.Store, app.CreateMailboxIdentity))
	mux.HandleFunc("DELETE /api/mailboxes/{id}/identities/{identityId}", auth.Require(app.Store, app.DeleteMailboxIdentity))

	mux.HandleFunc("GET /api/mailboxes/{id}/forwards", auth.Require(app.Store, app.ListMailboxForwards))
	mux.HandleFunc("POST /api/mailboxes/{id}/forwards", auth.Require(app.Store, app.CreateMailboxForward))
	mux.HandleFunc("DELETE /api/mailboxes/{id}/forwards/{forwardId}", auth.Require(app.Store, app.DeleteMailboxForward))

	mux.HandleFunc("GET /api/mailboxes/{id}/delegation", auth.Require(app.Store, app.GetMailboxDelegation))
	mux.HandleFunc("PUT /api/mailboxes/{id}/delegation", auth.Require(app.Store, app.UpdateMailboxDelegation))

	mux.HandleFunc("GET /api/mailboxes/{id}/listing", auth.Require(app.Store, app.GetMailboxListing))
	mux.HandleFunc("PUT /api/mailboxes/{id}/listing", auth.Require(app.Store, app.UpdateMailboxListing))

	mux.HandleFunc("GET /api/mailboxes/{id}/notes", auth.Require(app.Store, app.GetMailboxNotes))
	mux.HandleFunc("PUT /api/mailboxes/{id}/notes", auth.Require(app.Store, app.UpdateMailboxNotes))

	mux.HandleFunc("GET /api/mailboxes/{id}/expiration", auth.Require(app.Store, app.GetMailboxExpiration))
	mux.HandleFunc("PUT /api/mailboxes/{id}/expiration", auth.Require(app.Store, app.UpdateMailboxExpiration))

	mux.HandleFunc("GET /api/mailboxes/{id}/limits", auth.Require(app.Store, app.GetMailboxLimits))
	mux.HandleFunc("PUT /api/mailboxes/{id}/limits", auth.Require(app.Store, app.UpdateMailboxLimits))

	mux.HandleFunc("GET /api/billing/overview", auth.Require(app.Store, app.GetBillingOverview))
	mux.HandleFunc("GET /api/billing/plans", auth.Require(app.Store, app.ListPlans))
	mux.HandleFunc("POST /api/billing/checkout", auth.Require(app.Store, app.CreateCheckoutSession))
	mux.HandleFunc("POST /api/billing/portal", auth.Require(app.Store, app.CreateBillingPortalSession))
	mux.HandleFunc("GET /api/billing/invoices", auth.Require(app.Store, app.ListInvoices))

	// Public - Stripe calls this directly, never a logged-in customer. The
	// webhook signature (verified inside StripeWebhook) is the only trust
	// boundary.
	mux.HandleFunc("POST /api/webhooks/stripe", app.StripeWebhook)

	log.Printf("amelu api listening on %s", cfg.HTTPAddr)
	// EdgeAuth sits outermost: with ORIGIN_SHARED_SECRET set (production,
	// once the Tunnel+Worker exist) it rejects anything that didn't pass
	// through the edge Worker before CORS or any route even runs. Empty
	// secret (today's default) makes it a no-op passthrough. See
	// docs/cloudflare/TUNNEL.md and SECURITY.md.
	handler := handlers.EdgeAuth(cfg.OriginSharedSecret, handlers.CORS(cfg.CORSOrigin, mux))
	if err := http.ListenAndServe(cfg.HTTPAddr, handler); err != nil {
		log.Fatalf("serve: %v", err)
	}
}
