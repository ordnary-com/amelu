# Deployment

Last verified against Cloudflare documentation: 2026-07-15.

## Overview

Nothing in this migration deploys automatically on push. Every deploy is
either a manual local `wrangler deploy` (an engineer, with their own scoped
API token) or a `workflow_dispatch`-gated GitHub Actions run requiring
explicit approval - see `.github/workflows/deploy-production.yml`.

## CI workflows in this repo

| Workflow | Trigger | What it does | Deploys? |
|---|---|---|---|
| `.github/workflows/go.yml` | push, PR | `go build ./...`, `go vet ./...`, `go test ./...` | No |
| `.github/workflows/frontend.yml` | push, PR | `pnpm install`, `pnpm --filter frontend build` (Vite build only, not `tsc -b` - see `PAGES_FRONTEND.md` "Common errors" for why), lint | No |
| `.github/workflows/edge-worker.yml` | push, PR (paths: `cloudflare/edge/**`) | `npm install`, `npm run typecheck`, `npm test` in `cloudflare/edge` | No |
| `.github/workflows/queue-consumer.yml` | push, PR (paths: `cloudflare/queues/**`) | same, for `cloudflare/queues/domain-verification` | No |
| `.github/workflows/deploy-preview.yml` | PR (paths: `cloudflare/edge/**`) | Stubbed - `if: false` guard, does not run deploy steps even on a matching PR. Documents the intended preview-deploy shape without executing it, since it needs `CLOUDFLARE_API_TOKEN` this repo's CI doesn't have configured for untrusted PR branches | **No** (intentionally disabled) |
| `.github/workflows/deploy-production.yml` | `workflow_dispatch` only, requires the `production` GitHub Environment's manual approval | Runs migration checks (see below), sets Worker + Container secrets from GitHub Actions secrets, then `wrangler deploy --env production` for the edge Worker - which now also builds and pushes the origin's Container image from `backend/Dockerfile` (see `[[containers]]` in `cloudflare/edge/wrangler.jsonc`) | **Yes, but only on explicit manual trigger + approval** |

All build/test workflows use a concurrency group per
branch/PR (`concurrency: { group: "${{ github.workflow }}-${{
github.ref }}", cancel-in-progress: true }`) so superseded runs don't queue
up.

## Migration checks before deploy

`deploy-production.yml` runs, before any `wrangler deploy`:

1. `go build ./... && go vet ./... && go test ./...` (backend must be green
   - this also builds the exact code that goes into the Container image)
2. `cd cloudflare/edge && npm run typecheck && npm test`
3. No separate database migration step to gate: Amelu's Postgres
   migrations are applied automatically by the Container at Go API
   startup, against whatever `DATABASE_URL` (Neon) is set for that
   environment, per the root `AGENTS.md`.

## Deploying the edge Worker + origin Container manually (not via CI)

```
cd cloudflare/edge
npx wrangler secret put ORIGIN_BASE_URL --env production
npx wrangler secret put ORIGIN_SHARED_SECRET --env production
npx wrangler secret put ALLOWED_ORIGIN --env production
npx wrangler secret put DATABASE_URL --env production
npx wrangler secret put STALWART_BASE_URL --env production
npx wrangler secret put STALWART_ADMIN_USER --env production
npx wrangler secret put STALWART_ADMIN_PASSWORD --env production
# ...and the rest of the origin's env vars - see SECRETS.md's full
# inventory and cloudflare/edge/src/container.ts's envVars for the
# complete list (Resend, Stripe, Domain Connect, Ordnary, admin/internal
# shared secrets).
npx wrangler deploy --env production
```

`wrangler deploy` builds the Container image from `backend/Dockerfile`
(Docker must be available locally, or use CI which runs on a Docker-
capable runner) and pushes it alongside the Worker.

**Changes production state**: yes, immediately serves `api.amelu.org` (once
the custom domain is attached, see `EDGE_WORKER.md`), backed by the
Container instead of the historical Tunnel+VPS path (see `TUNNEL.md`).

## Deploying the queue consumer manually

```
cd cloudflare/queues/domain-verification
npx wrangler secret put ORIGIN_BASE_URL
npx wrangler secret put INTERNAL_JOBS_SHARED_SECRET
npx wrangler deploy
```

Low risk - nothing enqueues to this queue yet (`QUEUES.md` "Status"), so
deploying it has no user-facing effect until adopted.

## Deploying the Workflows

Not recommended yet - both call Go internal endpoints that either don't
exist (`stalwart-provisioning`) or are gated behind a feature flag that
defaults off (`mailbox-expiration`, safe either way since it's idempotent,
but still not required). If deploying `mailbox-expiration` anyway:

```
cd cloudflare/workflows/mailbox-expiration
npx wrangler secret put ORIGIN_BASE_URL
npx wrangler secret put INTERNAL_JOBS_SHARED_SECRET
npx wrangler deploy
```

## Order of operations for a first production rollout

1. `DASHBOARD_SETUP.md` (once), plus a Neon project and a Workers Paid
   plan (Containers requirement - see `PREREQUISITES.md`).
2. Point `DATABASE_URL` at Neon and confirm the origin's schema migrations
   apply cleanly on first boot (see `ARCHITECTURE.md`).
3. Deploy the edge Worker (with its bound Container) to its `*.workers.dev`
   URL, verify with `curl` directly (no custom domain yet).
4. Verify `GET https://<worker>.workers.dev/healthz/upstream` returns 200
   - this now reaches the Container via the Durable Object binding, not a
   Tunnel.
5. Deploy Pages to its `*.pages.dev` preview URL with `VITE_API_URL`
   pointed at the Worker's `workers.dev` URL, verify the dashboard works
   end-to-end against the new path.
6. Only then: `DNS_AND_MAIL.md` cutover, attaching `app.amelu.org` and
   `api.amelu.org` as custom domains as part of that same window.

## Rollback

See `ROLLBACK.md` for the consolidated procedure across every piece. Worker-
specific: `npx wrangler rollback --env production`. Pages-specific:
dashboard "Rollback to this deployment".
