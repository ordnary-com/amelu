# GKE: Future Consideration, Not Part of This Migration

Last verified against Cloudflare documentation: 2026-07-15.

**This migration does not introduce Kubernetes or GKE, anywhere, and GKE is
not an operational dependency of anything documented in this directory.**
Every piece described here - the edge Worker, Queues, Workflows, R2,
Pages - runs without a Kubernetes cluster.

Note: the Go origin was later moved onto **Cloudflare Containers** (see
`ARCHITECTURE.md`), which is a distinct, managed product - a Worker-bound
Durable Object wrapping a single Docker image, not a general-purpose
orchestrator. It doesn't give Amelu pod scheduling, custom resource types,
multi-container pods, or any of the GKE capabilities this document weighs
below; adopting it doesn't change any of this document's reasoning against
introducing a real orchestrator.

## When GKE might become worth evaluating later

Not today, and not as a consequence of anything in this migration. A future
trigger would look like:

- **Heavy multi-tenant compute scaling needs** beyond what a small number
  of Cloudflare Container instances (`max_instances` in
  `cloudflare/edge/wrangler.jsonc`) can handle - e.g. if Amelu grew
  per-customer compute-intensive workloads (large-scale mail processing,
  ML-based spam filtering run in-house rather than via Stalwart's built-in
  capabilities) that need independent horizontal scaling, resource
  isolation, or scheduling more sophisticated than "run more copies of the
  same stateless Go binary behind a Tunnel."
- **Need for workload-level isolation** between customers or job types that
  a single shared Go process can't provide - e.g. if Stalwart provisioning
  or a future batch-processing job needed to run untrusted or
  resource-unpredictable customer-supplied logic.
- **Outgrowing what Cloudflare's serverless primitives fit well** - Workers/
  Queues/Workflows are a good fit for short-lived, stateless, HTTP- or
  message-triggered logic (which is everything in this migration); a
  long-running, stateful, or GPU-bound workload wouldn't fit that model and
  might genuinely need a general-purpose orchestrator.

## What would NOT be a reason to introduce GKE

- Current traffic/scale - nothing in `COSTS.md` or the architecture
  suggests today's load needs anything beyond a Go process + Postgres +
  Tunnel.
- "Kubernetes is more standard" - not a technical requirement; the existing
  stdlib-`net/http`, no-framework Go backend (per the root `AGENTS.md`)
  is a deliberate simplicity choice this migration preserves, not a gap.
- Wanting container orchestration for the Go API alone - Cloudflare
  Containers' own `max_instances` already provides horizontal replicas
  without an orchestrator; adding one just to run more copies of a single
  stateless binary would be net-new operational complexity for no
  corresponding benefit.

## If it ever becomes relevant

That would be a separate, deliberate architectural decision made with its
own migration plan, prerequisites, and rollback procedure - following the
same discipline as this document set, not bolted onto this migration
after the fact. Nothing in this migration's design (Worker -> Container ->
Go origin) precludes that origin later running on GKE instead - the Worker
side would just need a different binding/proxy target than the current
Durable-Object-backed Container.
