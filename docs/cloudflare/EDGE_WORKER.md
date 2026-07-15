# Edge Worker

Last verified against Cloudflare documentation: 2026-07-15.

Source: `cloudflare/edge/`. This Worker is the public entrypoint for
`api.amelu.org` - the only thing on the internet that can reach the Go
origin.

## What it does

- Proxies every request to `ORIGIN_BASE_URL` (the private Tunnel hostname in
  production, `localhost:8081` locally), preserving method, query string,
  headers (minus a small strip-list of hop-by-hop/edge-internal ones), and
  body - streamed through untouched, never buffered or re-parsed. See
  `cloudflare/edge/src/proxy.ts`.
- Preserves the raw Stripe webhook body byte-for-byte - the same
  `Request.body` stream reference is forwarded, so nothing here can alter
  bytes before `internal/handlers/billing.go`'s signature check. Verified
  by `cloudflare/edge/test/unit.test.ts`'s "Stripe raw body preservation"
  tests, including a binary-content case.
- Generates a request id (`X-Request-Id`) if the client didn't send one,
  and always forwards/returns it, for correlating a support request across
  edge and origin logs.
- Adds security headers (`X-Content-Type-Options`, `X-Frame-Options`,
  `Content-Security-Policy`, `Strict-Transport-Security`,
  `Referrer-Policy`, `Permissions-Policy`) to every response.
- Enforces strict single-origin CORS (`ALLOWED_ORIGIN`), matching
  `backend/internal/handlers/cors.go`'s behavior - never reflects an
  arbitrary `Origin` header.
- Sets `Cache-Control: no-store` on every proxied response - nothing from
  this API is ever cacheable by a shared cache.
- `GET /healthz` - answered entirely at the edge, no origin call.
- `GET /healthz/upstream` - actually reaches the origin's `GET
  /api/healthz`, for genuine end-to-end health checks.
- Authenticates every proxied request to the origin with an HMAC-signed
  `X-Origin-Shared-Secret` header (`cloudflare/edge/src/sign.ts`), verified
  by `backend/internal/handlers/edge_auth.go`.
- On any origin failure, returns a stable JSON error shape:
  `{"error": "...", "requestId": "..."}`.
- Never logs secrets, cookies, auth headers, or webhook bodies -
  `cloudflare/edge/src/redact.ts` redacts before any `console.log`.

## Local development

```
cd cloudflare/edge
npm install
cp .dev.vars.example .dev.vars   # edit ORIGIN_BASE_URL if the Go API isn't on :8081
npm run dev
```

No Cloudflare account needed - `wrangler dev` runs entirely locally via
Miniflare. Point `ORIGIN_BASE_URL` at your local Go API (`pnpm dev` at the
repo root, per the root `AGENTS.md`).

## Deploying (manual/CI-gated, not run automatically)

```
cd cloudflare/edge
npx wrangler deploy --env preview      # or --env production
```

Requires `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` and the secrets
below already set via `wrangler secret put`. See `DEPLOYMENT.md` for the
gated CI workflow - this is never run automatically on a push.

**Changes production state?** Yes, for `--env production` - deploys new
Worker code serving `api.amelu.org` (once the custom domain is attached,
see step below). `--env preview` deploys to a preview URL with no
production impact.

## Attaching the custom domain

Not committed in `wrangler.jsonc` (commented out) - this is a one-time
dashboard or `wrangler` action once a Cloudflare account/zone exists:

```
npx wrangler deploy --env production
npx wrangler triggers deploy --env production   # or attach via dashboard: Workers & Pages -> amelu-edge-api -> Settings -> Domains & Routes
```

Reference: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

## Secrets (never in wrangler.jsonc)

| Secret | Set via | Used for |
|---|---|---|
| `ORIGIN_BASE_URL` | `wrangler secret put ORIGIN_BASE_URL` | private Tunnel hostname |
| `ORIGIN_SHARED_SECRET` | `wrangler secret put ORIGIN_SHARED_SECRET` | Worker->origin HMAC auth |
| `ALLOWED_ORIGIN` | `wrangler secret put ALLOWED_ORIGIN` | CORS (technically not secret, kept alongside the others for one `wrangler secret bulk` flow - see `SECRETS.md`) |

See `SECRETS.md` for rotation.

## Testing

```
cd cloudflare/edge
npm run typecheck   # tsc --noEmit
npm test            # vitest run, via @cloudflare/vitest-pool-workers
```

25 tests: pure-function unit tests (`test/unit.test.ts` - CORS, redaction,
signing, security headers, request/response building, Stripe raw-body
preservation including a binary payload) and end-to-end tests via
`SELF.fetch` (`test/worker.test.ts` - health endpoints, CORS preflight,
error handling with a deliberately unreachable test origin). See
`TESTING.md`.

## Streaming and the raw Stripe body

`buildOriginRequest` in `cloudflare/edge/src/proxy.ts` forwards
`incoming.body` (the original `ReadableStream`) directly into the new
`Request` constructor with `duplex: "half"` - required by the Workers
runtime whenever a streamed body is attached to an outbound `fetch`/
`Request`. Nothing in this Worker calls `.json()`, `.text()`, or `.clone()`
on the Stripe webhook path, which would force a buffer/re-serialize and
risk changing byte-for-byte content (whitespace, key order, unicode
normalization) that Stripe's HMAC signature covers.

Reference: https://developers.cloudflare.com/workers/runtime-apis/request/#the-requestinitcfproperties-type
(duplex streaming) and https://docs.stripe.com/webhooks#verify-events

## Common errors and fixes

- **502 "upstream request failed"** - `ORIGIN_BASE_URL` unreachable; check
  the Tunnel is running (`TUNNEL.md`) and `cloudflared` shows the tunnel as
  connected.
- **401 from the origin on every request** - `ORIGIN_SHARED_SECRET` set on
  one side (Worker or origin) but not the other, or the two values differ.
  Both must match exactly - see `SECRETS.md`.
- **CORS error in the browser despite a correct `ALLOWED_ORIGIN`** - the
  Worker never reflects the request's `Origin` header, it only ever returns
  the configured `ALLOWED_ORIGIN`; if the frontend's actual origin doesn't
  match exactly (scheme + host + port), the browser will still reject it.

## Rollback

`npx wrangler rollback --env production` reverts to the previously deployed
Worker version instantly (Cloudflare keeps deployment history). To fully
back out of the Worker, repoint `api.amelu.org` DNS at the previous API host
directly - see `DNS_AND_MAIL.md` "Rollback" and `ROLLBACK.md`.

Reference: https://developers.cloudflare.com/workers/wrangler/commands/#rollback
