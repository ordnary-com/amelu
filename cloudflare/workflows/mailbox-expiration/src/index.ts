import { MailboxExpirationWorkflow, type Env as WorkflowEnv } from "./workflow";

export { MailboxExpirationWorkflow };

interface Env extends WorkflowEnv {
  MAILBOX_EXPIRATION_WORKFLOW: Workflow;
}

export default {
  // Cron Trigger (see wrangler.jsonc "triggers.crons") - fires every 15
  // minutes. Each tick creates one new Workflow instance rather than
  // running the sweep inline here, so a slow/retried sweep can't cause
  // overlapping cron ticks to pile up in this Worker's own execution
  // (Workflow instances run independently with their own durable retry
  // state) - see docs/cloudflare/WORKFLOWS.md.
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await env.MAILBOX_EXPIRATION_WORKFLOW.create({
      params: { triggeredAt: new Date(controller.scheduledTime).toISOString() },
    });
  },
} satisfies ExportedHandler<Env>;
