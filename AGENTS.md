# Amelu

Amelu is an email hosting SaaS product by Ordnary. It provisions and manages
mailboxes and domains on top of a self-hosted Stalwart mail server, backed by
its own Postgres database for account/billing metadata - kept separate from
Stalwart's own mail data store.

This is a pnpm monorepo: `frontend` (React/Vite) talks to `backend` (Go) over
a JSON HTTP API. `pnpm dev` at the repo root starts both together.

## Layout

- `frontend/` - React 19 + Vite + react-router v7. UI is Material Web
  Components (`@material/web`), styled through one global stylesheet
  (`frontend/public/app.css`) - no Tailwind, no other component library.
  Pages live in `frontend/src/pages`, one file per route, all wired flat in
  `frontend/src/App.tsx` (no file-based routing, no nested layouts besides
  the single `Layout` wrapper). Every API call goes through the one typed
  client in `frontend/src/api/client.ts` (a `request<T>` wrapper plus one
  method per endpoint) - never `fetch` directly from a page.
- `backend/` - Go, stdlib `net/http` with 1.22+ pattern routing
  (`mux.HandleFunc("GET /api/...", ...)` in `cmd/api/main.go`), no web
  framework. Postgres via `pgx`, no ORM - `internal/db/store.go` plus
  feature-specific split files (`billing.go`, `sieve_rules.go`,
  `password_reset.go`) hand-write SQL. Migrations are plain `.sql` files
  under `internal/db/migrations/`, embedded via `go:embed` and applied
  automatically at API startup - there is no separate migrate command,
  just add the next-numbered file and restart.
- Auth is cookie-session based (`internal/auth`); `auth.Require(...)` wraps
  a route and `requireCustomer(w, r)` pulls the resolved customer back out
  inside the handler.
- Optional integrations all follow the same convention: missing
  config/API key means the feature reports "unavailable" at request time,
  never a startup failure. See `internal/config/config.go`. Currently:
  Stalwart (required), Domain Connect (Cloudflare DNS auto-fix), Resend
  (transactional email), Stripe (billing).

## Running locally

```
pnpm install
pnpm dev        # starts frontend (:5173) and backend (:8081) together
```

Needs `backend/.env` (copy `backend/.env.example`) and a reachable Postgres
at `DATABASE_URL`. Requires Node 20+ (see `.nvmrc`) - Vite's rolldown build
does not run on Node 18.

## Production

Deployed on Cloudflare: `app.amelu.org` (Pages) -> `api.amelu.org` (edge
Worker) -> Cloudflare Tunnel -> Go API + Postgres (Docker on a Hetzner VPS).
Mail (Stalwart, MX) is separate infrastructure, untouched by this stack. See
`docs/cloudflare/` for the full architecture/ops docs, and
`docs/FRONTEND_DEPLOYS.md` for how to actually ship a frontend change
(manual `wrangler pages deploy` today - no CI/CD deploy yet).

## Conventions worth knowing before editing

- No comments explaining *what* code does - only *why*, when something is
  genuinely non-obvious (a workaround, a subtle constraint, a hidden
  invariant).
- Don't add abstractions, config knobs, or validation for cases that can't
  actually happen here.
- Before adding a new frontend page, sidebar section, or backend resource,
  find and mirror the closest existing example rather than inventing a new
  shape - list pages, create forms, settings forms, and sub-sidebars all
  already have an established pattern in `Layout.tsx` and `pages/`.
