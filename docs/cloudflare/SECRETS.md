# Secrets

Last verified against Cloudflare documentation: 2026-07-15.

**Never commit a real value for any of these.** Every example file in this
repo (`.env.example`, `.dev.vars.example`) contains placeholders or
dev-only throwaway values, never production secrets.

## Inventory

| Secret | Used by | Set via (local) | Set via (prod/preview) | Rotation |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CI, `wrangler` CLI | `wrangler login` or env var | GitHub Actions secret | Regenerate in dashboard (My Profile -> API Tokens), update GitHub secret, revoke old token |
| `CF_ACCOUNT_ID` | CI, `wrangler` CLI | env var (not secret, but kept alongside for convenience) | GitHub Actions secret or repo variable | N/A - account IDs don't rotate |
| Tunnel credentials JSON | `cloudflared` (historical - see `TUNNEL.md`) | N/A - the Hetzner VPS this ran on was decommissioned 2026-07-18 | N/A | Moot - nothing to rotate, the credential lived only on the now-deleted VPS |
| `DATABASE_URL` | Go origin (`backend/internal/db`) | `backend/.env` (local Postgres) | `wrangler secret put DATABASE_URL --env production` (`deploy-production.yml`), forwarded into the Container's env by `cloudflare/edge/src/container.ts` | Neon Dashboard -> reset role password / rotate, update the GitHub Actions secret, redeploy the Worker (which re-provisions the Container with the new env) |
| `ORIGIN_SHARED_SECRET` | edge Worker <-> Go origin (`EdgeAuth`) | `.dev.vars` (edge Worker), `backend/.env` (`ORIGIN_SHARED_SECRET`) | `wrangler secret put ORIGIN_SHARED_SECRET --env production`, same value forwarded to the Container via `container.ts` | Generate a new random value (`openssl rand -hex 32`), update the GitHub Actions secret, redeploy - both sides update together in one Worker deploy now that the origin no longer has its own separate deploy path |
| `INTERNAL_JOBS_SHARED_SECRET` | Queue/Workflow Workers <-> Go origin (`auth.RequireInternal`), forwarded through amelu-edge-api's `/internal/*` passthrough | `.dev.vars` (queue/workflow packages), `backend/.env` | `wrangler secret put INTERNAL_JOBS_SHARED_SECRET` (each Queue/Workflow package, and `deploy-production.yml` for the Container's copy) | Same procedure as `ORIGIN_SHARED_SECRET`, independently - rotating one never requires rotating the other |
| `STRIPE_SECRET_KEY` | Go origin billing handlers | `backend/.env` (test-mode key) | `wrangler secret put STRIPE_SECRET_KEY --env production`, from Stripe Dashboard | Stripe Dashboard -> Developers -> API keys -> roll key. Update the GitHub Actions secret, redeploy. No other Cloudflare-side action needed - Stripe traffic passes through the Worker unmodified |
| `STRIPE_WEBHOOK_SECRET` | Go origin billing webhook signature check | `backend/.env`, or `stripe listen --print-secret` | Stripe Dashboard -> webhook endpoint config, `wrangler secret put STRIPE_WEBHOOK_SECRET --env production` | Regenerate in Stripe Dashboard when rotating the webhook endpoint; update the GitHub Actions secret, redeploy. Verification is entirely origin-side, the Worker only forwards the raw body |
| `STALWART_BASE_URL` / `STALWART_ADMIN_USER` / `STALWART_ADMIN_PASSWORD` | Go origin -> Stalwart admin API | `backend/.env` | `wrangler secret put ... --env production` | Rotate in Stalwart's own admin config, then update the GitHub Actions secret, redeploy - unrelated to this migration, pre-existing credential |
| `RESEND_API_KEY` | Go origin transactional email | `backend/.env` (optional) | `wrangler secret put RESEND_API_KEY --env production` | Resend Dashboard -> API Keys -> roll |
| `DOMAIN_CONNECT_PRIVATE_KEY` / `DOMAIN_CONNECT_PUBKEY_DOMAIN` / `DOMAIN_CONNECT_REDIRECT_URI` | Go origin Domain Connect signing | `backend/.env` (optional) | `wrangler secret put ... --env production` | Regenerate via `go run ./cmd/domainconnect-keygen`; requires re-approval of the new public key with Cloudflare's Domain Connect template review - not an instant rotation, plan ahead |
| `ORDNARY_ISSUER` / `ORDNARY_CLIENT_ID` / `ORDNARY_CLIENT_SECRET` / `ORDNARY_REDIRECT_URI` / `ORDNARY_COOKIE_SECRET` | Go origin "Login with Ordnary account" | `backend/.env` (optional) | `wrangler secret put ... --env production` | Rotate in ordnary-identity's client registration first, then update the GitHub Actions secret, redeploy |
| `AMELU_ADMIN_SHARED_SECRET` | Go origin <-> Helm admin API (`internal/auth/admin.go`) | `backend/.env` (optional) | `wrangler secret put AMELU_ADMIN_SHARED_SECRET --env production` | Must match `helm-api`'s copy - rotate both together |
| R2 access key ID / secret access key | future `R2Store` Go implementation (not yet built - see `R2_STORAGE.md`) | N/A yet | `wrangler secret put` once implemented | Dashboard -> R2 -> Manage API Tokens -> roll. Not applicable until the R2 implementation exists |
| `CF_TUNNEL_ID` | `config.yml`, `docker-compose.yml` (historical - see `TUNNEL.md`) | not secret (an identifier), but kept alongside credentials since it's meaningless without them | same | N/A - tied to the tunnel itself |

## GitHub Actions secret inventory

| Secret name | Used by workflow(s) | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `.github/workflows/deploy-preview.yml` (stubbed), `.github/workflows/deploy-production.yml` | Scoped per `DASHBOARD_SETUP.md` step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | same | Not secret-sensitive but stored as a secret for consistency with the token |
| `ORIGIN_SHARED_SECRET` | `deploy-production.yml` (sets the Worker secret via `wrangler secret put` during deploy) | Never printed to logs - `wrangler secret put` reads from stdin/env, not a CLI arg, so it never appears in Actions logs |
| `INTERNAL_JOBS_SHARED_SECRET` | same, for Queue/Workflow packages | |
| `DATABASE_URL`, `STALWART_BASE_URL`, `STALWART_ADMIN_USER`, `STALWART_ADMIN_PASSWORD`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DOMAIN_CONNECT_PRIVATE_KEY`, `DOMAIN_CONNECT_PUBKEY_DOMAIN`, `DOMAIN_CONNECT_REDIRECT_URI`, `ORDNARY_ISSUER`, `ORDNARY_CLIENT_ID`, `ORDNARY_CLIENT_SECRET`, `ORDNARY_REDIRECT_URI`, `ORDNARY_COOKIE_SECRET`, `AMELU_ADMIN_SHARED_SECRET` | `deploy-production.yml` | New as of the Containers migration - the origin used to be deployed out-of-band on the Hetzner VPS with its own `.env`, so these never needed a GitHub Actions entry before. Now the origin is deployed via `wrangler` as a Container, so every one of its env vars flows through this same workflow, same as the Worker's own secrets |

R2 access keys remain the one exception once implemented - see the main
inventory table above.

## No secrets in logs

- `cloudflare/edge/src/redact.ts` and the same pattern intended for any
  future logging in `cloudflare/queues`/`cloudflare/workflows` - redact
  `Authorization`, `Cookie`, `Set-Cookie`, `X-Amelu-Internal-Signature`,
  `X-Origin-Shared-Secret`, `Stripe-Signature` before any log line.
- `wrangler secret put` reads the value from stdin/an env var passed to the
  command, never as a bare CLI argument that would appear in shell history
  or process listings.
- CI workflows (`DEPLOYMENT.md`) never `echo` a secret and never pass one as
  a build arg logged by the runner.

## Local development secrets

None of the above are required to run `pnpm dev` (root) or the individual
`cloudflare/*` packages' local dev/test commands - see
`LOCAL_DEVELOPMENT.md`. `.dev.vars.example`/`.env.example` files use
obviously-fake placeholder values safe to use as-is for local dev (e.g.
`ORIGIN_SHARED_SECRET=dev-only-shared-secret-change-me`).

## References

- Wrangler secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- API tokens: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- GitHub Actions secrets: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
