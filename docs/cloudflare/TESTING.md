# Testing

Last verified against Cloudflare documentation: 2026-07-15.

## What's tested and how to run it

### Go backend

```
cd backend
go build ./...
go vet ./...
go test ./...
```

New/changed test coverage from this migration:

- `internal/auth/internal_test.go` - `RequireInternal`/`VerifySignedHeader`:
  valid signature, wrong secret, stale signature (replay window), wrong
  path, empty secret (fail closed), missing header. 6 tests.
- `internal/objectstore/store_test.go` - key namespacing/uniqueness, empty
  customerID rejection, path-traversal filename sanitization, local
  signed-URL round trip, expired/tampered signature rejection. 6 tests.
- All pre-existing tests (`internal/domainconnect`, `internal/sieve`,
  `internal/stalwart`) continue to pass unmodified.

### Edge Worker

```
cd cloudflare/edge
npm install
npm run typecheck   # tsc --noEmit
npm test             # vitest run, @cloudflare/vitest-pool-workers
```

25 tests across two files:

- `test/unit.test.ts` (19 tests) - pure functions, no workerd network
  needed: CORS header construction/preflight, header redaction, HMAC
  signing determinism, security headers, request id forwarding/generation,
  header strip-list + anti-spoofing, URL rewriting, GET/HEAD body omission,
  **Stripe raw-body byte-for-byte preservation** (including a binary
  payload case), response header layering, stable error shape.
- `test/worker.test.ts` (6 tests) - end-to-end via `SELF.fetch` inside the
  real workerd runtime: health endpoints, CORS preflight (including
  non-reflection of an arbitrary `Origin`), error responses against a
  deliberately unreachable test origin, request id propagation, security
  headers on error responses.

### Queue consumer

```
cd cloudflare/queues/domain-verification
npm install
npm run typecheck
npm test
```

10 tests in `test/consumer.test.ts`: backoff growth/cap, DNS
match/mismatch/lookup-failure outcomes, **duplicate-delivery idempotency**
(same idempotency key skips a second DNS lookup; a different key doesn't),
signed-request construction for the persist call, persist-call failure
propagation, and full `queue()` handler behavior for both the retry path
and the ack-on-success-with-duplicate-delivery path.

### Workflows

```
cd cloudflare/workflows
npm install
npm run typecheck
```

Typecheck only - no runtime tests, since both Workflows call Go endpoints
that either don't exist yet (`stalwart-provisioning`) or are feature-flagged
off by default (`mailbox-expiration`) - see `WORKFLOWS.md` "Status". Testing
these meaningfully requires either a live Cloudflare account (Workflows
don't have the same local-simulation support Queues does via
`@cloudflare/vitest-pool-workers`) or mocking away the exact thing being
verified (the real HTTP call shape), which wasn't judged worth the false
confidence for design-stage scaffolding.

### Frontend

```
cd frontend
npx vite build            # bundling/build works (this migration's actual concern)
npx tsc -b                # pre-existing, unrelated type errors - see PAGES_FRONTEND.md
```

This migration didn't add or change any frontend application code beyond
`public/_redirects` (a static file, nothing to unit test) and
`VITE_API_URL` usage (pre-existing, `frontend/src/api/client.ts`) - no new
frontend tests were needed.

## Running everything in one pass

```
(cd backend && go build ./... && go vet ./... && go test ./...) && \
(cd cloudflare/edge && npm test) && \
(cd cloudflare/queues/domain-verification && npm test) && \
(cd cloudflare/workflows && npm run typecheck) && \
(cd frontend && npx vite build)
```

## CI enforcement

Each of the above (except the Workflows typecheck-only and the frontend
`vite build` step, both covered under the same CI jobs as backend/edge) runs
in its own GitHub Actions workflow on every push/PR - see `DEPLOYMENT.md`
"CI workflows in this repo". None of them deploy; they only build/test.

## What's deliberately not covered

- No live-Cloudflare integration tests (real Worker hitting a real Tunnel
  hitting a real Postgres) - out of scope for this migration's automated
  tests, which per the task's constraints must not hit any live Cloudflare
  API. `EDGE_WORKER.md`/`DEPLOYMENT.md` describe the manual verification
  steps for after a real deploy.
- No load/performance testing - not requested, and premature before real
  traffic patterns are known (see `COSTS.md`/`MONITORING.md` for the
  observability that would inform it later).
