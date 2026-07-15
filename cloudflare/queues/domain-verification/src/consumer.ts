import type { DomainVerificationMessage, Env, VerificationOutcome } from "./types";
import { lookupTXT } from "./dns";
import { signOriginRequest } from "./sign";

// Per-isolate, best-effort dedup for messages that arrive twice in close
// succession (Cloudflare Queues is at-least-once delivery, so duplicate
// delivery is expected, not exceptional). This is NOT the source of truth
// for idempotency - it only avoids redundant work within one warm isolate.
// The real guarantee is that POST /internal/jobs/domain-verified on the Go
// side is an idempotent upsert (UPDATE ... WHERE status != 'verified' is
// safe to run any number of times for the same domainId) - see
// docs/cloudflare/QUEUES.md "Idempotency model". Bounded so it can't grow
// unbounded across a long-lived isolate.
const MAX_SEEN = 500;
const seenIdempotencyKeys = new Map<string, VerificationOutcome>();

function rememberOutcome(key: string, outcome: VerificationOutcome): void {
  if (seenIdempotencyKeys.size >= MAX_SEEN) {
    const oldest = seenIdempotencyKeys.keys().next().value;
    if (oldest !== undefined) seenIdempotencyKeys.delete(oldest);
  }
  seenIdempotencyKeys.set(key, outcome);
}

export function backoffSeconds(attempt: number): number {
  // Exponential backoff with a cap, matching the max_retries=5 configured
  // in wrangler.jsonc: 30s, 60s, 120s, 240s, 480s (max 10 min).
  return Math.min(30 * 2 ** Math.max(0, attempt - 1), 600);
}

export async function verifyDomain(
  msg: DomainVerificationMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<VerificationOutcome> {
  const cached = seenIdempotencyKeys.get(msg.idempotencyKey);
  if (cached) return cached;

  let outcome: VerificationOutcome;
  try {
    const result = await lookupTXT(msg.expectedTxtRecord.name, fetchImpl);
    const verified = result.values.includes(msg.expectedTxtRecord.value);
    outcome = {
      idempotencyKey: msg.idempotencyKey,
      domainId: msg.domainId,
      verified,
      reason: verified ? undefined : "expected TXT value not found",
    };
  } catch (err) {
    outcome = {
      idempotencyKey: msg.idempotencyKey,
      domainId: msg.domainId,
      verified: false,
      reason: `dns lookup error: ${String(err)}`,
    };
  }

  rememberOutcome(msg.idempotencyKey, outcome);
  return outcome;
}

export async function persistVerified(env: Env, outcome: VerificationOutcome, fetchImpl: typeof fetch = fetch): Promise<void> {
  const path = "/internal/jobs/domain-verified";
  const body = JSON.stringify({ domainId: outcome.domainId, idempotencyKey: outcome.idempotencyKey });
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("X-Amelu-Internal-Signature", await signOriginRequest(env.INTERNAL_JOBS_SHARED_SECRET, "POST", path));

  const res = await fetchImpl(new URL(path, env.ORIGIN_BASE_URL).toString(), {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(`persist verified domain failed: origin returned ${res.status}`);
  }
}

/** Exposed for tests to reset the per-isolate dedup cache between cases. */
export function __resetDedupCacheForTests(): void {
  seenIdempotencyKeys.clear();
}

export default {
  async queue(batch: MessageBatch<DomainVerificationMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const outcome = await verifyDomain(message.body);

      if (!outcome.verified) {
        console.log(
          JSON.stringify({
            msg: "domain verification not yet satisfied",
            domainId: outcome.domainId,
            idempotencyKey: outcome.idempotencyKey,
            reason: outcome.reason,
            attempt: message.attempts,
          }),
        );
        // Below max_retries (wrangler.jsonc), Cloudflare Queues retries
        // automatically; once exhausted, the message is routed to
        // amelu-domain-verification-dlq for manual/async follow-up rather
        // than being silently dropped.
        message.retry({ delaySeconds: backoffSeconds(message.attempts) });
        continue;
      }

      try {
        await persistVerified(env, outcome);
        console.log(
          JSON.stringify({
            msg: "domain verification persisted",
            domainId: outcome.domainId,
            idempotencyKey: outcome.idempotencyKey,
          }),
        );
        message.ack();
      } catch (err) {
        console.error(
          JSON.stringify({
            msg: "failed to persist verified domain",
            domainId: outcome.domainId,
            idempotencyKey: outcome.idempotencyKey,
            error: String(err),
          }),
        );
        message.retry({ delaySeconds: backoffSeconds(message.attempts) });
      }
    }
  },
};
