import { StalwartProvisioningWorkflow } from "./workflow";

export { StalwartProvisioningWorkflow };

// This Workflow has no public HTTP trigger by design in this migration -
// it is meant to be started from the Go origin (via a Workflow service
// binding or the Cloudflare API) right after a domain is marked verified,
// not from an internet-facing route. See docs/cloudflare/WORKFLOWS.md
// "Stalwart provisioning: status" for what's still to be wired up before
// this can run for real.
export default {
  async fetch(): Promise<Response> {
    return new Response("not a public entrypoint", { status: 404 });
  },
} satisfies ExportedHandler;
