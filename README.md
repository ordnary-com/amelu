<img src="frontend/public/amelu-logo.png" alt="Amelu" height="40" />

Email hosting on your own domain, from [Ordnary](https://ordnary.com).

---

## Why we built this

We wanted email on our own domain that we actually control: real IMAP/SMTP,
no lock-in to a big provider, no proprietary web client. Most "custom domain
email" options turn out to be a reseller markup on top of Google Workspace,
or they leave you self-hosting a mail server yourself, which starts as a
weekend project and quietly becomes a permanent job: DNS records, spam
reputation, a server you now have to keep patched forever.

Amelu is our attempt at a middle path. Under the hood it's
[Stalwart](https://stalw.art), an open-source mail server, doing the actual
mail handling. Amelu is the layer on top: a dashboard for verifying domains,
setting up aliases, getting DNS right, and billing, so running your own mail
server feels like signing up for a SaaS product instead of wrangling a
server yourself at 1am because a cert expired.

Right now it's a working demo, not a public launch, so don't go telling all
your friends yet. Domain verification, mailbox provisioning, and billing all
work end to end against a real Stalwart instance we operate, but we're still
hardening things before opening it up more broadly.

## What it does

Verify a domain and get guided DNS instructions, with automatic fixes via
Domain Connect where that's supported. Create mailboxes and aliases, forward
addresses, set up a catch-all. Spam filtering is on by default and doesn't
need any setup.

Since it's plain IMAP, SMTP, and POP3 underneath, any mail client works,
no proprietary app you're stuck with, use Thunderbird, Apple Mail, whatever
you like. Billing runs through Stripe with a real free tier and monthly or
annual paid plans. And because Stalwart runs on infrastructure we operate
ourselves rather than someone else's platform, mail and data stay on servers
in the EU.

## Architecture

Nothing fancy, just a few pieces talking to each other:

- `frontend/`: React 19 + Vite dashboard, deployed to Cloudflare Pages.
- `backend/`: Go API, stdlib `net/http`, no framework, Postgres via `pgx`,
  no ORM. This is the only thing the frontend ever talks to. Stalwart and
  Postgres are never exposed directly.
- `cloudflare/edge/`: small TypeScript Worker, public entrypoint for
  `api.amelu.org`, proxies to the Go origin over a private Cloudflare
  Tunnel.
- `cloudflare/queues/` + `cloudflare/workflows/`: the durable async stuff,
  domain verification, Stalwart provisioning, retries, dead-letter handling.

Postgres only stores account and billing metadata, kept separate from
Stalwart's own mail store on purpose. Full migration architecture, rollout
plan, rollback procedures: that's all in
[`docs/cloudflare/`](docs/cloudflare/README.md) if you're curious.

## Tech stack

- Frontend: React 19, Vite, react-router-dom, Material Web Components
- Backend: Go 1.26, stdlib `net/http`, `pgx` (no ORM, no framework)
- Mail: [Stalwart](https://stalw.art), talked to via its admin API
- Billing: Stripe
- Transactional email: [Resend](https://resend.com)
- Edge/CDN/DNS: Cloudflare (Pages, Workers, Tunnel, Queues, Workflows, R2)
- Everything glued together with pnpm workspaces

## Running it locally

You'll need:

- Node 20+ (`.nvmrc` has the exact version, Vite's rolldown build doesn't
  run on Node 18, learned that the hard way)
- pnpm 9
- Go 1.26+
- a reachable PostgreSQL instance

```bash
git clone https://github.com/ordnary-com/amelu.git
cd amelu
pnpm install

cp backend/.env.example backend/.env
# fill in DATABASE_URL, STALWART_BASE_URL, STALWART_ADMIN_USER, STALWART_ADMIN_PASSWORD at minimum

pnpm dev
```

That starts the frontend at `http://localhost:5173` and the backend at
`http://localhost:8081`. Migrations are plain `.sql` files under
`backend/internal/db/migrations/`, embedded via `go:embed` and applied
automatically on backend startup, no separate migrate command to remember or
forget.

The rest of the integrations (Domain Connect, Resend, Stripe, "Login with
Ordnary account") follow the same pattern: if the config is missing, the
feature just shrugs and reports itself unavailable at request time instead
of crashing on startup. `backend/.env.example` has the full list of
variables.

### Running tests

```bash
cd backend && go build ./... && go vet ./... && go test ./...
cd cloudflare/edge && npm test
```

## Project structure

```
amelu/
├── backend/               Go API
│   ├── cmd/api/           entrypoint
│   └── internal/          auth, db, handlers, stalwart client, ordnaryauth, ...
├── frontend/               React dashboard (Cloudflare Pages)
├── cloudflare/
│   ├── edge/               public API Worker
│   ├── queues/              domain verification consumer
│   ├── workflows/           Stalwart provisioning, mailbox expiration
│   ├── tunnel/              cloudflared config examples
│   └── terraform/           DNS/WAF templates (not applied automatically)
├── docs/cloudflare/        architecture, deployment, security, rollback docs
└── .github/workflows/      CI: Go, frontend, edge Worker, queue consumer, preview/prod deploy
```

## Deployment

Production runs at `app.amelu.org` (Pages) and `api.amelu.org` (edge Worker,
then Tunnel, then the Go origin on a private VPS), with Postgres running
alongside the API in Docker. [`docs/cloudflare/DEPLOYMENT.md`](docs/cloudflare/DEPLOYMENT.md)
has the full procedure, and [`docs/cloudflare/ROLLBACK.md`](docs/cloudflare/ROLLBACK.md)
covers backing out of a bad deploy.

## Security

Found a security issue? Email **abuse@amelu.org** instead of opening a
public issue. [`docs/cloudflare/SECURITY.md`](docs/cloudflare/SECURITY.md)
describes what's actually in place in production (TLS, WAF, rate limiting,
secret rotation).

## Contributing

Issues and pull requests are welcome. Before making structural changes, skim
`AGENTS.md` for this repo's conventions, no framework on the backend, no
ORM, and mirror existing patterns rather than inventing new ones. Submitting
a contribution means you agree to the terms in
[`LICENSE.md`](LICENSE.md#4-contributions).

## License

Amelu is source-available, not open source in the OSI sense: the code is
public so you can read it, verify it, and contribute back, but Ordnary keeps
the commercial and hosting rights. That means no self-hosting Amelu, no
reusing the code in your own projects, and no offering it as a service under
another name. Full terms are in [`LICENSE.md`](LICENSE.md).
</content>
