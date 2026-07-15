export interface Env {
  ORIGIN_BASE_URL: string;
  // Distinct from the edge Worker's ORIGIN_SHARED_SECRET - this consumer
  // calls POST /internal/jobs/domain-verified directly over the Tunnel,
  // authenticated the same way backend/internal/auth.RequireInternal
  // authenticates other internal job callers (see docs/cloudflare/SECRETS.md).
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
