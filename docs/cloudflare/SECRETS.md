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
| Tunnel credentials JSON | `cloudflared` | file on origin host, referenced by `config.yml` | same, deployed to origin host(s) out-of-band (not via GitHub Actions - never leaves the origin infra) | `cloudflared tunnel create` a replacement tunnel, update `config.yml`/DNS route, decommission the old one - see `TUNNEL.md` |
| `ORIGIN_SHARED_SECRET` | edge Worker <-> Go origin (`EdgeAuth`) | `.dev.vars` (edge Worker), `backend/.env` (`ORIGIN_SHARED_SECRET`) | `wrangler secret put ORIGIN_SHARED_SECRET` (Worker) + origin process env (deployment-specific, not GitHub Actions) | Generate a new random value (`openssl rand -hex 32`), set on the origin first, then the Worker, then redeploy the Worker - a brief window where the Worker's old secret is rejected is expected and safe (502s, not a security gap) |
| `INTERNAL_JOBS_SHARED_SECRET` | Queue/Workflow Workers <-> Go origin (`auth.RequireInternal`) | `.dev.vars` (queue/workflow packages), `backend/.env` | `wrangler secret put INTERNAL_JOBS_SHARED_SECRET` (each Queue/Workflow package) + origin env | Same procedure as `ORIGIN_SHARED_SECRET`, independently - rotating one never requires rotating the other |
| `STRIPE_SECRET_KEY` | Go origin billing handlers | `backend/.env` (test-mode key) | origin process env, from Stripe Dashboard | Stripe Dashboard -> Developers -> API keys -> roll key. Update origin env, restart. No Cloudflare-side action needed - Stripe traffic passes through the Worker unmodified |
| `STRIPE_WEBHOOK_SECRET` | Go origin billing webhook signature check | `backend/.env`, or `stripe listen --print-secret` | Stripe Dashboard -> webhook endpoint config, origin process env | Regenerate in Stripe Dashboard when rotating the webhook endpoint; update origin env. Never touches Cloudflare - the Worker forwards the raw body, verification is entirely origin-side |
| `STALWART_ADMIN_USER` / `STALWART_ADMIN_PASSWORD` | Go origin -> Stalwart admin API | `backend/.env` | origin process env | Rotate in Stalwart's own admin config, then update origin env - unrelated to this migration, pre-existing credential |
| `RESEND_API_KEY` | Go origin transactional email | `backend/.env` (optional) | origin process env | Resend Dashboard -> API Keys -> roll |
| `DOMAIN_CONNECT_PRIVATE_KEY` | Go origin Domain Connect signing | `backend/.env` (optional) | origin process env | Regenerate via `go run ./cmd/domainconnect-keygen`; requires re-approval of the new public key with Cloudflare's Domain Connect template review - not an instant rotation, plan ahead |
| R2 access key ID / secret access key | future `R2Store` Go implementation (not yet built - see `R2_STORAGE.md`) | N/A yet | `wrangler secret put` once implemented, or origin process env | Dashboard -> R2 -> Manage API Tokens -> roll. Not applicable until the R2 implementation exists |
| `CF_TUNNEL_ID` | `config.yml`, `docker-compose.yml` | not secret (an identifier), but kept alongside credentials since it's meaningless without them | same | N/A - tied to the tunnel itself; changes only when creating a replacement tunnel |

## GitHub Actions secret inventory

| Secret name | Used by workflow(s) | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `.github/workflows/deploy-preview.yml` (stubbed), `.github/workflows/deploy-production.yml` | Scoped per `DASHBOARD_SETUP.md` step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | same | Not secret-sensitive but stored as a secret for consistency with the token |
| `ORIGIN_SHARED_SECRET` | `deploy-production.yml` (sets the Worker secret via `wrangler secret put` during deploy) | Never printed to logs - `wrangler secret put` reads from stdin/env, not a CLI arg, so it never appears in Actions logs |
| `INTERNAL_JOBS_SHARED_SECRET` | same, for Queue/Workflow packages | |

No other secret in the inventory above needs a GitHub Actions entry - none
of the Go-origin-only secrets (Stripe, Stalwart, Resend, Domain Connect) are
touched by any Cloudflare deploy workflow; they belong to the origin's own
deployment process, outside this repo's CI.

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
