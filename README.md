<p align="center">
  <a href="https://amelu.org"><img src=".github/assets/amelu-logo.png" alt="Amelu" height="48" /></a>
</p>

<p align="center">
  <a href="https://ordnary.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/powered-by-ordnary-white.png" />
      <img src=".github/assets/powered-by-ordnary-dark.png" alt="powered by Ordnary" height="16" />
    </picture>
  </a>
</p>

<p align="center">
  <strong>Email hosting on your own domain, by <a href="https://ordnary.com">Ordnary</a>.</strong>
</p>

<p align="center">
  <a href="https://app.amelu.org"><img src="https://img.shields.io/badge/status-live-2ea44f" alt="Status: live" /></a>
  <a href="https://github.com/ordnary-com/amelu/actions/workflows/go.yml"><img src="https://github.com/ordnary-com/amelu/actions/workflows/go.yml/badge.svg" alt="Go" /></a>
  <a href="https://github.com/ordnary-com/amelu/actions/workflows/edge-worker.yml"><img src="https://github.com/ordnary-com/amelu/actions/workflows/edge-worker.yml/badge.svg" alt="Edge Worker" /></a>
  <img src="https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white" alt="Go 1.26" />
  <img src="https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white" alt="Angular 22" />
  <img src="https://img.shields.io/badge/mail-Stalwart-4B5563" alt="Stalwart" />
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-source--available-0051fe" alt="License: source-available" /></a>
</p>

<p align="center">
  <a href="https://amelu.org">Website</a>
  &nbsp;·&nbsp;
  <a href="https://app.amelu.org">Dashboard</a>
  &nbsp;·&nbsp;
  <a href="https://status.amelu.org">Status</a>
  &nbsp;·&nbsp;
  <a href="#security">Security</a>
</p>

---

Amelu gives businesses and individuals mailboxes on their own domain with
real IMAP, POP3 and SMTP, a branded webmail, and a dashboard that walks you
through DNS. The mail itself is handled by [Stalwart](https://stalw.art), an
open-source mail server we run ourselves in the EU; Amelu is everything
around it.

## What it does

- **Domains:** add a domain, see which DNS records are right and which are
  missing, and fix them in one click at providers that support Domain
  Connect.
- **Mailboxes and addresses:** mailboxes with their own limits, aliases,
  domain aliases, catch-all recipients, Bcc captures, pattern rewrites and
  CSV import and export.
- **Spam filtering:** on by default, with adjustable strictness and allow and
  block lists per domain.
- **Webmail:** Roundcube on `webmail.amelu.org`, or on the customer's own
  hostname with their name, logo and colour.
- **Organizations:** teammates, an activity log, API keys and billing through
  Stripe.
- **Any mail client:** it's plain IMAP, POP3 and SMTP, with autoconfig for the
  common clients.

## How it's built

```
app.amelu.org  ─┐
                ├─> api.amelu.org (edge Worker) ─> Go API (Cloudflare Container) ─┬─> Neon Postgres
webmail.amelu.org ─> Roundcube on marduk                                         └─> Stalwart on marduk
```

| Part | Where | What |
|---|---|---|
| `beta/` | Worker `amelu-beta` on `app.amelu.org` | The dashboard: Angular 22 (standalone, signals) and Tailwind v4 |
| `frontend/` | Cloudflare Pages, no domain | The previous React dashboard, kept until `beta/` covers every page |
| `backend/` | Cloudflare Container behind the edge Worker | Go API, stdlib `net/http`, Postgres via `pgx`, no framework, no ORM |
| `cloudflare/edge/` | `api.amelu.org` | Public entrypoint; signs every request to the Go API and relays transactional mail |
| `cloudflare/queues/`, `cloudflare/workflows/` | Cloudflare | Domain verification, Stalwart provisioning, retries |
| `cloudflare/webmail/` | `webmail.amelu.org` | Worker in front of Roundcube |
| `cloudflare/autoconfig/`, `cloudflare/status/` | Cloudflare | Mail client autoconfig and the status page |
| `ops/` | marduk and the routers | Scripts and configs for the mail server and our own sending network |

Postgres holds accounts, domains and billing. Mail lives only in Stalwart's
own store on **marduk**, the mail server, and never in Postgres.

### Sending network

Outgoing mail leaves marduk from dedicated addresses, split into pools so new
domains can't hurt the reputation of established ones (`ops/marduk/amelu-ip-pools.py`).
Customers see the list on the dashboard's Sending IPs page.

We also run our own block, **89.106.70.0/24 on AS218905**, announced through
two Vultr routers (`ops/rtr1-ams/`, `ops/rtr1-par/`) and carried to marduk
over WireGuard, with automatic failover between them
(`ops/marduk/bgp-exit-check.sh`). It is not used for customer mail yet.

## Running it locally

You need Node 20+ (see `.nvmrc`), pnpm 9, Go 1.26+ and a PostgreSQL database.

```bash
pnpm install
cp backend/.env.example backend/.env   # fill in DATABASE_URL and the Stalwart settings
pnpm dev        # Go API on :8081 (and the old dashboard on :5173)
pnpm dev:beta   # the dashboard on :4200, /api proxied to :8081
```

Migrations are `.sql` files in `backend/internal/db/migrations/`, embedded
with `go:embed` and applied when the API starts. Optional integrations
(Domain Connect, mail relay, Stripe, Ordnary sign-in) report themselves as
unavailable when their settings are missing, instead of stopping the API.

> **Careful:** a local `.env` usually points at the production Stalwart.
> Mailboxes and domains you create or delete locally change for real, so keep
> `SENDING_LIMITS_SYNC=off`.

Tests:

```bash
cd backend && go vet ./... && go test ./...
cd cloudflare/edge && npm test
```

## Deploying

| What | How |
|---|---|
| Dashboard (`app.amelu.org`) | `pnpm deploy:beta` from the repo root |
| API, edge Worker, queues, workflows | See [`docs/cloudflare/DEPLOYMENT.md`](docs/cloudflare/DEPLOYMENT.md) |
| Rolling back | [`docs/cloudflare/ROLLBACK.md`](docs/cloudflare/ROLLBACK.md) |
| marduk and routers | By hand from `ops/`; each folder's README says what goes where |


## Security

- **Sign-in** goes through the customer's Ordnary account, so two-step
  verification and passkeys come from there. Amelu itself stores no account
  passwords.
- **Sessions** are server-side. The cookie carries a random token and only its
  SHA-256 hash is stored; it's `HttpOnly`, `Secure` and `SameSite=Lax`. API
  keys can't create further keys or change the account.
- **Nothing internal is public.** The Go API has no public listener, Postgres
  and Stalwart's admin API aren't exposed, and each hop is authenticated on
  its own: the edge signs requests to the API (HMAC), background jobs use a
  separate secret, and Stripe webhooks are verified before anything happens.
  Logs redact credentials and never include request bodies.

[`docs/cloudflare/SECURITY.md`](docs/cloudflare/SECURITY.md) has the full
breakdown. Report security issues to **abuse@ordnary.com**, not in a public
issue.

## Contributing

Issues and pull requests are welcome. Read `AGENTS.md` first: no backend
framework, no ORM, and new pages and endpoints follow the closest existing
one. Contributing means you agree to the terms in
[`LICENSE.md`](LICENSE.md#4-contributions).

## License

Amelu is source-available, not open source in the OSI sense. The code is
public so you can read it, see how Amelu works and contribute improvements
back. The terms are in [`LICENSE.md`](LICENSE.md); for anything beyond them,
email notices@ordnary.com.
