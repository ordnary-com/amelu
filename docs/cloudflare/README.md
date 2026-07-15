# Amelu on Cloudflare - Operator Guide

This directory documents migrating Amelu (Go API + Postgres + Stalwart mail
server + React/Vite dashboard) to a Cloudflare-fronted architecture, without
moving mail protocols, mailbox storage, or Postgres off their current
infrastructure. Read `ARCHITECTURE.md` first for the target picture, then
follow the guides below **in order** - each one assumes the previous steps
are done.

Last verified against Cloudflare documentation: 2026-07-15.

## Read in this order

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - the target system, request/async/mail
   flow diagrams, what moves where and why.
2. **[MIGRATION_PLAN.md](./MIGRATION_PLAN.md)** - every existing component classified
   (move / place behind Cloudflare / keep on origin / defer / do not migrate),
   phased rollout.
3. **[PREREQUISITES.md](./PREREQUISITES.md)** - accounts, domain access, tooling
   versions needed before touching anything.
4. **[DASHBOARD_SETUP.md](./DASHBOARD_SETUP.md)** - one-time Cloudflare account/zone
   setup (manual, dashboard-driven).
5. **[SECRETS.md](./SECRETS.md)** - every secret this migration introduces, where
   it lives, how it rotates. Read before deploying anything that needs one.
6. **[LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md)** - running everything locally,
   including the new edge Worker and queue consumer, with no live Cloudflare
   account required.
7. **[PAGES_FRONTEND.md](./PAGES_FRONTEND.md)** - Cloudflare Pages for the React
   dashboard.
8. **[EDGE_WORKER.md](./EDGE_WORKER.md)** - the public API entrypoint Worker.
9. **[TUNNEL.md](./TUNNEL.md)** - Cloudflare Tunnel connecting the Worker to the
   private Go origin.
10. **[QUEUES.md](./QUEUES.md)** and **[WORKFLOWS.md](./WORKFLOWS.md)** - async domain
    verification, Stalwart provisioning, mailbox expiration.
11. **[R2_STORAGE.md](./R2_STORAGE.md)** - private object storage for exports/reports
    (not mail).
12. **[DNS_AND_MAIL.md](./DNS_AND_MAIL.md)** - the DNS cutover itself, and the hard
    rules for what must never be proxied.
13. **[DEPLOYMENT.md](./DEPLOYMENT.md)** - putting it all together, CI/CD.
14. **[OPERATIONS.md](./OPERATIONS.md)** and **[MONITORING.md](./MONITORING.md)** - running
    this day to day.
15. **[SECURITY.md](./SECURITY.md)** - the trust boundaries and how they're enforced.
16. **[TESTING.md](./TESTING.md)** - what's tested and how to run it.
17. **[COSTS.md](./COSTS.md)** - what this adds to the bill.
18. **[ROLLBACK.md](./ROLLBACK.md)** - reversing any single piece of this.
19. **[GKE_FUTURE.md](./GKE_FUTURE.md)** - explicitly *not* part of this migration.

## What this migration does and does not do

**Does:** puts a Cloudflare Worker in front of the Go API, tunnels traffic to
it privately, serves the dashboard from Cloudflare Pages, adds Cloudflare
Queues/Workflows for a few async jobs, adds private R2 storage for exports
and reports, and tightens DNS so only genuinely web-facing records are
proxied.

**Does not:** touch Postgres (stays Postgres, not D1), touch the Go backend's
language or core structure, move live mailbox storage anywhere, expose
Stalwart's admin API publicly, proxy any mail protocol (SMTP/IMAP/POP3/
ManageSieve/MX) through Cloudflare, or introduce Kubernetes/GKE.

## Non-negotiable safety rules

These hold across every document and every piece of code in this migration:

1. PostgreSQL stays PostgreSQL - never replaced with D1.
2. The Go backend stays Go - never rewritten in TypeScript.
3. Live email and mailbox storage never moves to R2.
4. Stalwart's administration API is never exposed publicly.
5. SMTP, IMAP, POP3, ManageSieve, and mail MX hostnames are never proxied
   through Cloudflare's HTTP proxy.
6. Mail-related DNS records stay DNS-only (grey cloud), never orange-clouded.
7. Stripe webhook bodies are never altered before signature verification.
8. Stripe events are never enqueued before their signature is verified.
9. Authentication sessions and billing state are never stored in KV.
10. No secrets, tokens, account IDs, or production IPs in this repo - only
    placeholders (`${CF_ACCOUNT_ID}`, `${MAIL_IP_1}`, etc).
11. Local development never requires a live Cloudflare account.
12. Every migration step has a documented rollback.
13. Nothing in this repo applies Terraform, changes production DNS, deploys
    to production, or rotates secrets automatically.
14. Internal job endpoints require strong service authentication (HMAC
    shared secret here) and are unreachable from the public internet.

## Status of this migration in the repository right now

This is implementation + documentation for the migration - see
`MIGRATION_PLAN.md` for exactly what's code-complete vs. designed-only vs.
deferred. Nothing has been deployed; no live Cloudflare resources exist yet.
