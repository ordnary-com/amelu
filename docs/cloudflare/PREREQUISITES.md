# Prerequisites

Last verified against Cloudflare documentation: 2026-07-15.

Before starting any step in this migration, have the following ready.

## Accounts and access

- A Cloudflare account with the `amelu.org` zone added (or ready to add -
  see `DASHBOARD_SETUP.md`).
- Registrar access for `amelu.org` to update nameservers, if the zone isn't
  already on Cloudflare.
- A GitHub repo admin on `ordnary-com/amelu` to add Actions secrets and
  configure branch protection for the production deploy gate.
- Access to the current mail server host (for IP addresses, TLS certs, and
  confirming nothing here changes mail delivery).

## Tooling versions (must match what's in the repo)

| Tool | Version | Where it's pinned |
|---|---|---|
| Node.js | 20+ | `.nvmrc` (root) |
| pnpm | 9.15.9 | `package.json` `packageManager` field |
| Go | 1.26.4 | `backend/go.mod` |
| wrangler | ^4.111.0 | `cloudflare/edge/package.json`, `cloudflare/queues/*/package.json` |
| @cloudflare/vitest-pool-workers | ^0.18.5 | `cloudflare/edge/package.json` |

Install wrangler as a dev dependency (already in `package.json` under each
`cloudflare/*` package) rather than globally, so CI and every developer use
the same pinned version:

```
cd cloudflare/edge && npm install
```

## Cloudflare-side things to have before deploying anything (not before
reading the docs)

- A Cloudflare API token scoped to Workers/Pages/Queues/R2/DNS edit for the
  `amelu.org` account (see `SECRETS.md` for exact scopes and rotation).
- A Cloudflare Tunnel created and its credentials file available to the
  origin host (see `TUNNEL.md`).
- An R2 bucket in the EU jurisdiction, if adopting `R2_STORAGE.md` (optional,
  can be deferred).

None of this is required to read the rest of the docs or run anything
locally - see `LOCAL_DEVELOPMENT.md` for working without any of it.

## What you do NOT need

- A GKE/Kubernetes cluster - see `GKE_FUTURE.md`.
- Access to rotate Stripe live-mode keys - test-mode keys are sufficient for
  everything in this migration.
- Root/admin on the Stalwart mail server - nothing here changes Stalwart
  configuration.

## References

- Cloudflare account setup: https://developers.cloudflare.com/fundamentals/setup/account/
- Workers: https://developers.cloudflare.com/workers/get-started/guide/
