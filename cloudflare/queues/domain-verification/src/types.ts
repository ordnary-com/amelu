export interface Env {
  // The amelu-edge-api Worker's public hostname (e.g. https://api.amelu.org)
  // - there's no more private Tunnel hostname to call directly once the
  // origin moves to a Cloudflare Container bound only inside that Worker's
  // own wrangler.jsonc (see docs/cloudflare/ARCHITECTURE.md). Requests to
  // /internal/* pass through amelu-edge-api like any other path but are
  // exempt from its own X-Origin-Shared-Secret check (backend/internal/
  // handlers/edge_auth.go) - this INTERNAL_JOBS_SHARED_SECRET signature is
  // the real auth for this call.
  ORIGIN_BASE_URL: string;
  // Distinct from the edge Worker's ORIGIN_SHARED_SECRET - this consumer
  // calls POST /internal/jobs/domain-verified, authenticated the same way
  // backend/internal/auth.RequireInternal authenticates other internal job
  // callers (see docs/cloudflare/SECRETS.md).
  INTERNAL_JOBS_SHARED_SECRET: string;
  ENVIRONMENT?: string;
  DOMAIN_VERIFICATION_QUEUE?: Queue<DomainVerificationMessage>;
}

/**
 * One domain-verification attempt. idempotencyKey is derived deterministically
 * from (domainId, expectedRecords) at enqueue time on the Go side - NOT a
 * random UUID per enqueue - so that re-enqueuing the same verification
 * intent (e.g. customer clicks "check DNS again" twice) collapses to the
 * same key rather than creating unrelated retry chains.
 */
export interface DomainVerificationMessage {
  idempotencyKey: string;
  domainId: string;
  domainName: string;
  expectedTxtRecord: {
    name: string;
    value: string;
  };
  enqueuedAt: string; // ISO 8601
}

export interface VerificationOutcome {
  idempotencyKey: string;
  domainId: string;
  verified: boolean;
  reason?: string;
}
