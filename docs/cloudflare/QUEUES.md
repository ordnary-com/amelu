# Queues

Last verified against Cloudflare documentation: 2026-07-15.

Source: `cloudflare/queues/domain-verification/`.

## Status

**Built and tested, not adopted.** The consumer Worker and the Go
`/internal/jobs/domain-verified` endpoint both exist and work; nothing in
the product yet enqueues a message to `amelu-domain-verification` - the
existing synchronous "check DNS" flow (`internal/dnscheck`, triggered from
the dashboard) remains the primary UX. Adopting this async path (having
`CreateDomain` or a scheduled recheck enqueue a message) is deferred
product work, tracked separately from this migration - see
`MIGRATION_PLAN.md`.

## Why a queue for this

Domain DNS verification is inherently a "check now, and again later if it's
not ready yet" problem - a customer adds a TXT record at their registrar,
propagation can take minutes to hours. A queue with retry/backoff models
that natively, instead of a cron job re-scanning every domain on every tick
or a customer-facing "click to recheck" being the only option.

## Setup (manual, once)

```
npx wrangler queues create amelu-domain-verification
npx wrangler queues create amelu-domain-verification-dlq
```

Declared as bindings in `cloudflare/queues/domain-verification/wrangler.jsonc`
(`producers`/`consumers`), but the queues themselves must exist before
`wrangler deploy` will succeed - not created automatically. See
`DASHBOARD_SETUP.md` step 7.

Reference: https://developers.cloudflare.com/queues/get-started/

## Message shape

```ts
interface DomainVerificationMessage {
  idempotencyKey: string;   // deterministic from (domainId, expectedRecords) - not a random UUID
  domainId: string;
  domainName: string;
  expectedTxtRecord: { name: string; value: string };
  enqueuedAt: string;       // ISO 8601
}
```

`idempotencyKey` is derived, not random, so re-enqueuing the same
verification intent (e.g. a customer clicks "check again") collapses to the
same key rather than starting an unrelated retry chain. See
`cloudflare/queues/domain-verification/src/types.ts`.

## Consumer logic

`cloudflare/queues/domain-verification/src/consumer.ts`:

1. DNS-over-HTTPS TXT lookup against `cloudflare-dns.com/dns-query` (Workers
   have no raw DNS socket access - DoH is the only option, not just the more
   reliable one, unlike `backend/internal/dnscheck`'s public-resolver choice
   for the same underlying reason of reliability).
2. If the TXT record matches: call `POST /internal/jobs/domain-verified`
   (HMAC-signed, see `SECRETS.md`), then `message.ack()`.
3. If not yet matching, or the DoH lookup itself fails: `message.retry({
   delaySeconds })` with exponential backoff (`backoffSeconds()`: 30s, 60s,
   120s, 240s, 480s, capped at 600s).
4. After `max_retries` (5, set in `wrangler.jsonc`) is exhausted, Cloudflare
   Queues automatically routes the message to the configured
   `dead_letter_queue` (`amelu-domain-verification-dlq`) rather than
   dropping it - see "Dead-letter queue" below.

## Idempotency model

Cloudflare Queues is **at-least-once delivery** - duplicate delivery of the
same message is expected, not exceptional. Two layers handle it:

1. **Consumer-side, best-effort**: a bounded per-isolate `Map` remembers
   recent `idempotencyKey` -> outcome pairs, so a duplicate delivered to the
   same warm isolate skips a redundant DNS lookup. This is *not* the source
   of truth - it's purely an optimization, and doesn't survive isolate
   recycling or a different isolate handling the duplicate.
2. **Origin-side, authoritative**: `POST /internal/jobs/domain-verified`
   calls `Store.MarkDomainVerified`, a plain `UPDATE domains SET status =
   'active', ... WHERE id = $1` - safe to run any number of times for the
   same `domainId`. This is what actually makes duplicate delivery safe, by
   construction, not by tracking which messages were "already processed."

Tested in `cloudflare/queues/domain-verification/test/consumer.test.ts`:
"duplicate delivery of the same message does not double-call the origin's
DNS lookup" and the retry-path test.

## Dead-letter queue

`amelu-domain-verification-dlq` receives messages that exhausted
`max_retries` - meaning DNS still didn't verify after roughly 15+ minutes of
retries. Nothing currently consumes the DLQ automatically (no product
requirement identified yet for auto-notifying a customer); it's a queue an
operator can inspect (`npx wrangler queues consumer add
amelu-domain-verification-dlq <temporary-debug-worker>` or via the
dashboard's message browser) to see domains that need manual follow-up
(e.g. an email nudge, or investigating a broken DoH lookup).

Reference: https://developers.cloudflare.com/queues/reference/dead-letter-queues/

## Local development

```
cd cloudflare/queues/domain-verification
npm install
cp .dev.vars.example .dev.vars
npm test          # runs entirely locally, no live queue needed
```

`npm run` doesn't include a `dev` script for this package since a queue
consumer has no meaningful standalone local server - test via `npm test`
(Miniflare-simulated queue batches) or via `wrangler dev` with a real bound
queue once one exists.

## Testing

```
npm test        # 10 vitest cases: DNS match/mismatch/failure, backoff
                 # growth, duplicate-delivery idempotency, retry vs ack
npm run typecheck
```

See `TESTING.md`.

## Common errors and fixes

- **"Queue does not exist"** on deploy - run the `wrangler queues create`
  commands above first; they're not automated.
- **Messages piling up in the DLQ** - almost always a genuinely broken TXT
  record, not a bug; the DNS answer is logged (redacted of nothing sensitive
  - domain names and TXT values aren't secrets) via `console.log` on each
  attempt.
- **`persist verified domain failed: origin returned 401`** - secret
  mismatch between `INTERNAL_JOBS_SHARED_SECRET` on the consumer and
  `INTERNAL_JOBS_SHARED_SECRET` on the Go origin - see `SECRETS.md`.

## Rollback

Since this path isn't wired into the product yet, "rollback" is simply not
enqueuing to it - no user-facing behavior depends on it. If it were adopted
and needed to be disabled: stop the producer call (feature flag on the Go
side, same pattern as `EXPIRATION_SWEEP_MODE`), leave the consumer deployed
(idle) or `wrangler delete` it - either is safe since MarkDomainVerified was
always callable from the existing synchronous path too.
