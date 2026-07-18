import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent, WorkflowStepConfig } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { signOriginRequest } from "../../shared/sign";

// DESIGN / SCAFFOLD ONLY - see docs/cloudflare/WORKFLOWS.md "Stalwart
// provisioning: status". This is not wired to a real deployment; it
// documents the intended step shape and compensation strategy so the Go
// origin's corresponding internal endpoints can be built to match. Every
// external call here already exists conceptually in
// backend/internal/stalwart/domains.go and mailboxes.go - this Workflow
// does not talk to Stalwart directly, it always goes through the Go
// origin's internal job endpoints, same as the other Workflows/consumers
// in this repo. Never talk to Stalwart's admin API directly from a Worker
// (see the repo-wide safety rule: Stalwart admin API must never be public).
//
// VERIFY AGAINST CURRENT DOCS before deploying: the exact step.do()
// retry-config shape and NonRetryableError semantics may have moved on
// from what's used here (https://developers.cloudflare.com/workflows/).

export interface Env {
  // amelu-edge-api's public hostname (e.g. https://api.amelu.org) - see
  // the equivalent comment in
  // cloudflare/queues/domain-verification/src/types.ts for why this is no
  // longer a private Tunnel hostname.
  ORIGIN_BASE_URL: string;
  INTERNAL_JOBS_SHARED_SECRET: string;
}

interface StalwartProvisioningParams {
  domainId: string;
  domainName: string;
  customerId: string;
}

const STANDARD_STEP_CONFIG: WorkflowStepConfig = {
  retries: {
    limit: 5,
    delay: "10 seconds",
    backoff: "exponential",
  },
  timeout: "30 seconds",
};

interface InternalJobResult {
  status: string;
}

async function callInternal(env: Env, path: string, body: unknown): Promise<InternalJobResult> {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("X-Amelu-Internal-Signature", await signOriginRequest(env.INTERNAL_JOBS_SHARED_SECRET, "POST", path));
  const res = await fetch(new URL(path, env.ORIGIN_BASE_URL).toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status >= 400 && res.status < 500) {
    // A 4xx from an internal endpoint means the request itself is wrong
    // (e.g. domain already deleted) - retrying identically won't help,
    // so this step fails the Workflow instance for manual review instead
    // of burning through retries.
    throw new NonRetryableError(`internal endpoint ${path} rejected the request: ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`internal endpoint ${path} returned ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as Partial<InternalJobResult>;
  return { status: data.status ?? String(res.status) };
}

/**
 * Every step is a plain idempotent upsert against Postgres/Stalwart state
 * keyed by domainId (never created fresh on each retry), so Workflows
 * re-running a step after a transient failure is always safe - see
 * docs/cloudflare/WORKFLOWS.md "Idempotency model" for the corresponding
 * Go-side contract each of these internal endpoints must uphold.
 */
export class StalwartProvisioningWorkflow extends WorkflowEntrypoint<Env, StalwartProvisioningParams> {
  async run(event: WorkflowEvent<StalwartProvisioningParams>, step: WorkflowStep) {
    const { domainId, domainName, customerId } = event.payload;

    // Step 1: confirm the domain is actually verified before provisioning
    // anything in Stalwart - re-checking here (not just trusting the
    // caller) means this Workflow is safe to invoke speculatively.
    await step.do("validate-domain-ownership", STANDARD_STEP_CONFIG, async () =>
      callInternal(this.env, "/internal/jobs/stalwart/validate-domain", { domainId }),
    );

    // Step 2: idempotent create-or-update of the Stalwart Domain object.
    await step.do("create-or-update-stalwart-domain", STANDARD_STEP_CONFIG, async () =>
      callInternal(this.env, "/internal/jobs/stalwart/upsert-domain", { domainId, domainName }),
    );

    // Step 3: idempotent create-or-update of the default mailbox
    // principal(s) for the domain (e.g. postmaster, abuse) - never bulk
    // customer mailbox creation, which stays on the existing synchronous
    // CreateMailbox handler.
    await step.do("provision-default-principals", STANDARD_STEP_CONFIG, async () =>
      callInternal(this.env, "/internal/jobs/stalwart/provision-principals", { domainId }),
    );

    // Step 4: persist final state + audit event. Runs last so a failure
    // in provisioning never gets marked "complete".
    await step.do("persist-state-and-audit", STANDARD_STEP_CONFIG, async () =>
      callInternal(this.env, "/internal/jobs/stalwart/mark-provisioned", { domainId, customerId }),
    );

    return { domainId, status: "provisioned" };

    // Compensation: Workflows does not auto-rollback prior steps on a
    // later permanent failure. If persist-state-and-audit permanently
    // fails (NonRetryableError) after Stalwart-side steps already
    // succeeded, the domain is left in a "stalwart_provisioned_pending_ack"
    // state (a status value the Go origin's schema would need to support -
    // not implemented in this migration, see WORKFLOWS.md) rather than
    // silently retried forever or torn back down automatically -
    // reversing a partially-provisioned mail domain automatically risks
    // deleting a domain a customer can already receive mail on. Manual
    // intervention (an ops runbook step, documented in WORKFLOWS.md) is
    // the deliberate choice here, not an oversight.
  }
}

export default StalwartProvisioningWorkflow;
