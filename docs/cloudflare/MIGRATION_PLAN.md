# Migration Plan

Last verified against Cloudflare documentation: 2026-07-15.

Every existing (or newly added) component, classified as one of: **Move to
Cloudflare**, **Place behind Cloudflare**, **Keep on origin**, **Defer**, or
**Explicitly do not migrate**.

| Component | Classification | Notes |
|---|---|---|
| React dashboard static assets | Move to Cloudflare | Cloudflare Pages. See `PAGES_FRONTEND.md`. |
| Go API HTTP listener | Place behind Cloudflare | Edge Worker (`cloudflare/edge`) + Tunnel (`cloudflare/tunnel`). The Go binary itself is unmodified in behavior, just no longer publicly reachable. |
| Go API application logic (handlers, routing) | Keep on origin | No rewrite. All changes in this migration are additive (new endpoints, new middleware), not a port. |
| Postgres | Keep on origin | Explicitly not migrated to D1 - safety rule #1. |
| Stalwart mail server (SMTP/IMAP/POP3/ManageSieve/admin API) | Keep on origin | Never proxied through Cloudflare's HTTP proxy; admin API never public. Safety rules #4, #5. |
| Live mailbox storage | Explicitly do not migrate | Stays on Stalwart's own disk. Safety rule #3. |
| CORS handling | Move to Cloudflare (duplicated, not replaced) | Edge Worker enforces CORS at the edge; `backend/internal/handlers/cors.go` is left in place unchanged for local dev (frontend hitting the Go API directly, no Worker in the loop). |
| Session/cookie auth | Keep on origin | Session verification (`internal/auth`) is unchanged Go code. Never moved to KV - safety rule #9. |
| Stripe billing + webhooks | Place behind Cloudflare (transport only) | The edge Worker proxies the raw webhook body byte-for-byte; signature verification (`internal/handlers/billing.go`) is unchanged Go code, still the only trust boundary. Safety rules #7, #8. |
| Domain Connect (Cloudflare DNS auto-fix) | Keep on origin | Unrelated to this migration - already a Cloudflare integration at the application layer, not a hosting decision. |
| Resend transactional email | Keep on origin | No change. |
| Mailbox expiration ticker | Defer | In-process ticker stays the default (`EXPIRATION_SWEEP_MODE=ticker`). Worker Cron Trigger + Workflow path is built and functional but not switched on by default - see `WORKFLOWS.md`. |
| Domain DNS verification (customer-facing "check DNS" button) | Keep on origin | Existing synchronous `internal/dnscheck` path is unchanged and remains the primary UX. |
| Domain DNS verification (async, queue-based) | Defer | New `cloudflare/queues/domain-verification` consumer and `/internal/jobs/domain-verified` endpoint exist and are tested, but nothing in the product enqueues to it yet - see `QUEUES.md` "Status". |
| Stalwart domain/mailbox provisioning | Defer | Existing synchronous provisioning in `CreateDomain`/mailbox handlers is unchanged. The `cloudflare/workflows/stalwart-provisioning` Workflow is a design/scaffold calling Go internal endpoints that don't exist yet - see `WORKFLOWS.md` "Status". |
| CSV exports / reports / support bundles | Move to Cloudflare (opt-in) | New `backend/internal/objectstore` package with a local-filesystem implementation today; an R2-backed implementation is designed (`R2_STORAGE.md`) but not implemented in Go yet, since it needs a real bucket to build against safely. |
| DNS records - web-facing (`amelu.org`, `app.`, `api.`, `status.`) | Move to Cloudflare | Proxied (orange-clouded). See `DNS_AND_MAIL.md`. |
| DNS records - mail-facing (MX, `mail.*`, `mx1-3.*`, SPF/DKIM/DMARC, autodiscover) | Place behind Cloudflare (DNS-only) | Cloudflare is the DNS host, but every record stays grey-clouded (DNS-only), never proxied. Safety rule #6. |
| Kubernetes / GKE | Explicitly do not migrate | See `GKE_FUTURE.md` - not introduced by this migration, not an operational dependency. |

## Phased rollout (recommended order)

1. **Prerequisites + dashboard setup** (`PREREQUISITES.md`, `DASHBOARD_SETUP.md`) -
   no production impact, account/zone setup only.
2. **Pages frontend** (`PAGES_FRONTEND.md`) - deploy to a Pages preview URL,
   not the production domain yet. Zero risk to the current frontend host.
3. **Edge Worker + Tunnel, in parallel with the existing public Go listener**
   (`EDGE_WORKER.md`, `TUNNEL.md`) - deploy both, verify `api.amelu.org`
   would work, but don't cut DNS over yet.
4. **DNS cutover** (`DNS_AND_MAIL.md`) - the only step that touches
   production traffic. Done last, with the rollback plan in hand.
5. **Queues/Workflows adoption** (`QUEUES.md`, `WORKFLOWS.md`) - optional,
   independent of the above; can happen before or after cutover with no
   interaction.
6. **R2 storage adoption** (`R2_STORAGE.md`) - optional, independent,
   product-level feature work to actually call the new `objectstore`
   endpoints from export/report handlers.

## What's genuinely code-complete right now

- `backend/go.mod`: local `replace` for `github.com/migadu/go-sieve` removed,
  pinned to the published `v1.1.2` tag. `go build`/`go vet`/`go test` all
  pass.
- `backend`: `GET /api/healthz`, `POST /internal/jobs/expiration-sweep`,
  `POST /internal/jobs/domain-verified`, `EdgeAuth` middleware,
  `EXPIRATION_SWEEP_MODE` feature flag, `internal/objectstore` package - all
  built, vetted, and unit-tested.
- `cloudflare/edge`: full proxying Worker, 25 passing tests.
- `cloudflare/queues/domain-verification`: full consumer, 10 passing tests
  including retry and duplicate-delivery idempotency.
- `cloudflare/workflows/*`: Workflow class definitions, typecheck clean,
  calling Go endpoints that are designed but not implemented
  (`/internal/jobs/stalwart/*`).
- `frontend/public/_redirects`: SPA fallback for Pages.

## What's deliberately not done

- No live Cloudflare resources created (no zone, no Worker deployed, no
  Tunnel token minted, no queue/bucket created) - see `DASHBOARD_SETUP.md`
  for the manual steps required first.
- No production DNS changed.
- No `terraform apply` run - `cloudflare/terraform/` is templates only.
- Stalwart-side internal endpoints (`/internal/jobs/stalwart/*`) referenced
  by the provisioning Workflow are not implemented in Go - the existing
  synchronous provisioning path is untouched and remains authoritative.
