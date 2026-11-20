# Amelu

Amelu is an email hosting SaaS product by Ordnary. It provisions and manages
mailboxes and domains on top of a self-hosted Stalwart mail server, backed by
its own Postgres database for account/billing metadata - kept separate from
Stalwart's own mail data store.

This is a pnpm monorepo: `frontend` (Angular) talks to `backend` (Go) over
a JSON HTTP API. `pnpm dev` at the repo root starts both together.

## Layout

- `frontend/` - the dashboard on app.amelu.org: Angular 22 (standalone,
  signals) with Tailwind v4. See `frontend/README.md`. Pages live in
  `frontend/src/app`, one folder per page or group of pages, each lazily
  loaded from `app.routes.ts`. Every API call goes through the shared client
  in `frontend/src/app/api.ts` (or a `*-api.ts` next to a page group). It has
  its own Ordnary sign-in page; `CORS_ORIGIN` lists its origin.
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
  inside the handler. `auth.Require` also accepts a personal API key in
  `Authorization: Bearer amelu_live_...`, acting as the key's owner. The
  account surface and API key management use `auth.RequireSession(...)`
  instead, which is cookie-only, so a leaked key can't mint further keys or
  take over the account.
- Optional integrations all follow the same convention: missing
  config/API key means the feature reports "unavailable" at request time,
  never a startup failure. See `internal/config/config.go`. Currently:
  Stalwart (required), Domain Connect (Cloudflare DNS auto-fix), mail
  (MAIL_RELAY_URL: Cloudflare Email Sending through the edge Worker, see
  cloudflare/edge/src/mail.ts), Stripe (billing).

## Running locally

```
pnpm install
pnpm dev        # starts the dashboard (:4200, proxies /api) and the backend (:8081)
```

Needs `backend/.env` (copy `backend/.env.example`) and a reachable Postgres
at `DATABASE_URL`. Requires Node 20+ (see `.nvmrc`) - Vite's rolldown build
does not run on Node 18.

## Production

Deployed on Cloudflare: `app.amelu.org` (Worker `amelu-beta`, static assets,
deployed with `pnpm deploy`) -> `api.amelu.org` (edge Worker) -> Go API +
Postgres. Mail (Stalwart, MX) is separate infrastructure, untouched by this
stack. The edge Worker, ops scripts and infra docs are kept outside this
repository (see `.gitignore`).

## Conventions worth knowing before editing

- No comments explaining *what* code does - only *why*, when something is
  genuinely non-obvious (a workaround, a subtle constraint, a hidden
  invariant).
- Don't add abstractions, config knobs, or validation for cases that can't
  actually happen here.
- Before adding a new frontend page, sidebar section, or backend resource,
  find and mirror the closest existing example rather than inventing a new
  shape - list pages, create forms, settings forms, and sub-sidebars all
  already have an established pattern in `frontend/src/app/shell` and the page folders.

## Devlog

Every change gets a short devlog entry in `devlog/`, listed in the index at
the bottom of `devlog/README.txt`. The folder is local only: it is in
`.gitignore` and never committed.

- **One entry per change**, not one per session. Two unrelated things means
  two files.
- **Short** - ten to fifteen lines. This is a quick note about what changed,
  not a write-up.
- **Plain text `.txt`, not markdown** - no headings, bold, backticks or link
  syntax, so an entry can be pasted straight into a devlog box elsewhere.
- **Specific** - name the endpoint, the table, the actual error string. Vague
  summaries ("cleaned up some backend flows") are worse than no entry.

See `devlog/README.txt` for the format.

## Licensing

Amelu is source-available under `LICENSE.md`: the code can be read, studied
and contributed to; anything beyond that needs a written license from
Ordnary. If a change touches how that's described, `LICENSE.md`, `README.md`
and `CONTRIBUTING.md` all say it and all three need to stay in sync.
