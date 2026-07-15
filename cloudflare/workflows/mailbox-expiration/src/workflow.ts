import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { signOriginRequest } from "../../shared/sign";

// Cloudflare Workflows API shape as of the 2026 docs
// (https://developers.cloudflare.com/workflows/) - WorkflowEntrypoint with
// a run(event, step) method, step.do() for retryable/durable steps.
// VERIFY AGAINST CURRENT DOCS before deploying: the exact retry-config
// shape passed to step.do() has changed across Workflows releases.
export interface Env {
  ORIGIN_BASE_URL: string;
  INTERNAL_JOBS_SHARED_SECRET: string;
}

interface MailboxExpirationParams {
  triggeredAt: string; // ISO 8601, informational/audit only
}

/**
 * Wraps the single call to POST /internal/jobs/expiration-sweep in a
 * Workflow step so that transient failures (origin momentarily
 * unreachable, Tunnel reconnecting) get Workflows' built-in retry with
 * backoff and durable execution history, instead of the trigger Worker's
 * `scheduled()` handler having to hand-roll retry logic. The call itself
 * is idempotent (see backend/internal/handlers/expiration_job.go), so
 * Workflows retrying the step is always safe.
 */
export class MailboxExpirationWorkflow extends WorkflowEntrypoint<Env, MailboxExpirationParams> {
  async run(event: WorkflowEvent<MailboxExpirationParams>, step: WorkflowStep) {
    const result = await step.do(
      "trigger-expiration-sweep",
      {
        retries: {
          limit: 5,
          delay: "30 seconds",
          backoff: "exponential",
        },
        timeout: "30 seconds",
      },
      async () => {
        const path = "/internal/jobs/expiration-sweep";
        const headers = new Headers();
        headers.set(
          "X-Amelu-Internal-Signature",
          await signOriginRequest(this.env.INTERNAL_JOBS_SHARED_SECRET, "POST", path),
        );
        const res = await fetch(new URL(path, this.env.ORIGIN_BASE_URL).toString(), {
          method: "POST",
          headers,
        });
        if (!res.ok) {
          throw new Error(`expiration sweep endpoint returned ${res.status}`);
        }
        return { status: res.status, triggeredAt: event.payload.triggeredAt };
      },
    );

    return result;
  }
}

export default MailboxExpirationWorkflow;
