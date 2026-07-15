<div align="center">

<img src="frontend/public/amelu-logo.png" alt="Amelu" height="40" />

**Email hosting on your own domain, fully managed.**

[![Go](https://github.com/ordnary-com/amelu/actions/workflows/go.yml/badge.svg)](https://github.com/ordnary-com/amelu/actions/workflows/go.yml)
[![Frontend](https://github.com/ordnary-com/amelu/actions/workflows/frontend.yml/badge.svg)](https://github.com/ordnary-com/amelu/actions/workflows/frontend.yml)
[![Edge Worker](https://github.com/ordnary-com/amelu/actions/workflows/edge-worker.yml/badge.svg)](https://github.com/ordnary-com/amelu/actions/workflows/edge-worker.yml)

[amelu.org](https://amelu.org) · [app.amelu.org](https://app.amelu.org) · [Report an issue](https://github.com/ordnary-com/amelu/issues)

</div>

---

Amelu is an email hosting product by [Ordnary](https://ordnary.com). It provisions and manages mailboxes,
aliases and domains on top of a self-hosted [Stalwart](https://stalw.art) mail server, with its own Postgres
database for account and billing metadata, kept separate from Stalwart's own mail store.

## Features

- **Domain hosting** — verify any domain, get guided DNS instructions, and (where supported) automatic DNS
  fixes via Domain Connect.
- **Mailboxes & aliases** — unlimited address and domain aliases, forwarding, catch-all addresses.
- **Spam filtering & pattern rewrites** — on by default, no extra configuration.
- **Billing** — Stripe-powered subscriptions with a real free tier, monthly or annual billing.
- **Standards-based** — plain IMAP, SMTP and POP3. No proprietary protocol, use any email client.
- **Self-hosted mail** — Stalwart runs on infrastructure we operate, not a big-tech reseller shelf.
- **EU-hosted** — mail and data stay on servers in the EU.

## Architecture

```
                     ┌──────────────────┐        ┌──────────────────┐
   Browser ───────▶  │  Cloudflare Pages │        │  Cloudflare Edge  │  ───▶  Cloudflare Tunnel  ───▶  Go API
                     │   (React/Vite)    │        │  Worker (public)  │                                   │
                     └──────────────────┘        └──────────────────┘                                   ▼
                                                                                                    PostgreSQL (pgx)
                                                                                                    Stalwart Mail Server
```

- **`frontend/`** — React 19 + Vite dashboard, deployed to Cloudflare Pages.
- **`backend/`** — Go API (stdlib `net/http`, 1.22+ pattern routing), Postgres via `pgx`, no ORM. The only
  thing the frontend talks to; Stalwart and Postgres are never exposed directly.
- **`cloudflare/edge/`** — TypeScript Worker that's the public entrypoint for `api.amelu.org`, proxying to the
  Go origin over a private Cloudflare Tunnel.
- **`cloudflare/queues/`**, **`cloudflare/workflows/`** — durable async jobs (domain verification, Stalwart
  provisioning) and their retry/dead-letter handling.

The full migration architecture, rollout plan and rollback procedures are documented in
[`docs/cloudflare/`](docs/cloudflare/README.md) — start there for anything infrastructure-related.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, react-router-dom, Material Web Components |
| Backend | Go 1.26, stdlib `net/http`, `pgx` (no ORM) |
| Database | PostgreSQL |
| Mail server | [Stalwart](https://stalw.art), managed via its admin API |
| Billing | Stripe |
| Transactional email | [Resend](https://resend.com) |
| Edge / CDN / DNS | Cloudflare (Pages, Workers, Tunnel, Queues, Workflows, R2) |
| Package manager | pnpm (workspace monorepo) |

## Getting started

### Prerequisites

- [Node.js 20+](https://nodejs.org) (see `.nvmrc` — Vite's rolldown build does not run on Node 18)
- [pnpm 9](https://pnpm.io) (`packageManager` pinned in `package.json`)
- [Go 1.26+](https://go.dev)
- A reachable PostgreSQL instance

### Setup

```bash
git clone https://github.com/ordnary-com/amelu.git
cd amelu
pnpm install

cp backend/.env.example backend/.env
# fill in DATABASE_URL, STALWART_BASE_URL, STALWART_ADMIN_USER, STALWART_ADMIN_PASSWORD at minimum

pnpm dev
```

This starts the frontend at `http://localhost:5173` and the backend at `http://localhost:8081`. Database
migrations are plain `.sql` files under `backend/internal/db/migrations/`, embedded via `go:embed` and applied
automatically on backend startup — there's no separate migrate command.

Optional integrations (Domain Connect, Resend, Stripe, "Login with Ordnary account") are all configured the
same way: missing config means the feature reports itself unavailable at request time rather than failing
startup. See `backend/.env.example` for the full list of variables.

### Running tests

```bash
cd backend && go build ./... && go vet ./... && go test ./...
cd cloudflare/edge && npm test
```

## Project structure

```
amelu/
├── backend/              Go API
│   ├── cmd/api/          entrypoint
│   └── internal/         auth, db, handlers, stalwart client, ordnaryauth, ...
├── frontend/              React dashboard (Cloudflare Pages)
├── cloudflare/
│   ├── edge/              public API Worker
│   ├── queues/             domain verification consumer
│   ├── workflows/          Stalwart provisioning, mailbox expiration
│   ├── tunnel/             cloudflared config examples
│   └── terraform/          DNS/WAF templates (not applied automatically)
├── docs/cloudflare/       architecture, deployment, security, rollback docs
└── .github/workflows/     CI: Go, frontend, edge Worker, queue consumer, preview/prod deploy
```

## Deployment

Production deploys to `app.amelu.org` (Pages), `api.amelu.org` (edge Worker → Tunnel → Go origin on a private
VPS), with Postgres running alongside the API in Docker. See
[`docs/cloudflare/DEPLOYMENT.md`](docs/cloudflare/DEPLOYMENT.md) for the full procedure and
[`docs/cloudflare/ROLLBACK.md`](docs/cloudflare/ROLLBACK.md) for how to back out of a bad deploy.

## Security

If you find a security issue, please email **abuse@amelu.org** rather than opening a public issue. See
[`docs/cloudflare/SECURITY.md`](docs/cloudflare/SECURITY.md) for the recommended production security
configuration (TLS, WAF, rate limiting, secret rotation).

## Contributing

Issues and pull requests are welcome. Before making structural changes, skim `AGENTS.md` for this repo's
conventions (no framework on the backend, no ORM, mirror existing patterns before inventing new ones).

## License

License TBD.
