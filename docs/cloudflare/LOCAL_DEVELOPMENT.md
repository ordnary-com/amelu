# Local Development

Last verified against Cloudflare documentation: 2026-07-15.

Everything in this migration runs locally with **no live Cloudflare
account** - safety rule #11. This doc covers running the new pieces
alongside the existing `pnpm dev` workflow described in the root
`AGENTS.md`.

## The baseline (unchanged)

```
pnpm install
pnpm dev        # frontend :5173, backend :8081
```

Still works exactly as before - none of this migration's code paths are on
by default (`EXPIRATION_SWEEP_MODE` defaults to `ticker`,
`ORIGIN_SHARED_SECRET`/`INTERNAL_JOBS_SHARED_SECRET` default to empty which
disables their checks). You do not need any `cloudflare/*` package running
to develop the frontend or backend.

## Running the edge Worker locally, in front of the local backend

```
cd cloudflare/edge
npm install
cp .dev.vars.example .dev.vars
npm run dev      # wrangler dev, entirely local via Miniflare
```

Point the frontend at the Worker instead of the backend directly:

```
cd frontend
VITE_API_URL=http://localhost:8787 pnpm dev   # wrangler dev's default port
```

This exercises the full proxy path locally, including HMAC signing/
verification if `ORIGIN_SHARED_SECRET` is set to the same value in both
`cloudflare/edge/.dev.vars` and `backend/.env`.

## Running the domain-verification queue consumer locally

```
cd cloudflare/queues/domain-verification
npm install
cp .dev.vars.example .dev.vars
npm test
```

No `wrangler dev` server for this package (a queue consumer has no
standalone HTTP surface) - test via `npm test` (Miniflare-simulated queue
batches, no live queue needed) as described in `QUEUES.md`.

## Checking the workflow scaffolding locally

```
cd cloudflare/workflows
npm install
npm run typecheck
```

No local runner for Workflows without a real Cloudflare account/binding -
these are typechecked, not exercised locally, since they're design
scaffolding (see `WORKFLOWS.md` "Status").

## Enabling the edge-auth/internal-auth checks locally (optional)

By default `ORIGIN_SHARED_SECRET`/`INTERNAL_JOBS_SHARED_SECRET` are unset in
`backend/.env.example`, so `EdgeAuth`/`RequireInternal` are effectively
disabled locally - the frontend can hit the backend directly without any
Worker in the loop, matching the existing `pnpm dev` experience. To
exercise the auth paths locally:

```
# backend/.env
ORIGIN_SHARED_SECRET=dev-only-shared-secret-change-me
INTERNAL_JOBS_SHARED_SECRET=dev-only-shared-secret-change-me

# cloudflare/edge/.dev.vars
ORIGIN_SHARED_SECRET=dev-only-shared-secret-change-me
```

Use different values in each real environment - these dev-only values are
committed as `.example` defaults precisely because they're not meant to
protect anything.

## Testing the internal job endpoint manually

```
cd backend
go run ./cmd/api    # with EXPIRATION_SWEEP_MODE=external, INTERNAL_JOBS_SHARED_SECRET set

# in another shell, sign a request the same way the Worker would:
go run - <<'EOF'
package main

import (
    "fmt"
    "time"
    "amelu/backend/internal/auth"
)

func main() {
    fmt.Println(auth.SignInternalRequest("dev-only-shared-secret-change-me", "POST", "/internal/jobs/expiration-sweep", time.Now()))
}
EOF

curl -X POST http://localhost:8081/internal/jobs/expiration-sweep \
  -H "X-Amelu-Internal-Signature: <value from above>"
```

## Running the mailbox expiration Workflow trigger against a local origin

Not practical without a live Cloudflare account (Workflows require the
Cloudflare platform even in `wrangler dev`, unlike Queues' local
simulation) - test the underlying endpoint directly as shown above instead.

## Common errors and fixes

- **CORS error hitting the Worker locally** - `ALLOWED_ORIGIN` in
  `.dev.vars` doesn't match the frontend's actual dev origin
  (`http://localhost:5173` by default).
- **502 from the Worker** - `ORIGIN_BASE_URL` in `.dev.vars` doesn't match
  where the Go backend is actually listening (`HTTP_ADDR` in
  `backend/.env`, default `:8081`).
- **401 on every request through the Worker** - `ORIGIN_SHARED_SECRET`
  differs between `cloudflare/edge/.dev.vars` and `backend/.env`.

## References

- `wrangler dev`: https://developers.cloudflare.com/workers/wrangler/commands/#dev
- Local testing for Workers: https://developers.cloudflare.com/workers/testing/
