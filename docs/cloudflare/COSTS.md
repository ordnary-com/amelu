# Costs

Last verified against Cloudflare documentation: 2026-07-15.

This is a planning reference, not a bill - always check current pricing
pages before budgeting, since Cloudflare's pricing changes independently of
this repo.

## What this migration adds

| Product | Free tier | Paid trigger | Notes |
|---|---|---|---|
| Workers (edge Worker) | 100,000 requests/day | Workers Paid ($5/mo + usage) once past free tier | Every API request through `api.amelu.org` counts as one Worker request |
| Pages | Unlimited requests/bandwidth on Free | Pages Functions usage if added later (not used here - Pages serves static assets only) | No meaningful cost driver for a dashboard's traffic volume |
| Cloudflare Tunnel | Free | N/A - Tunnel itself has no usage-based cost | Runs on existing origin infrastructure (compute cost, not a new Cloudflare line item) |
| Queues | 1M operations/month free (Workers Paid plan) | Workers Paid required to use Queues at all | Only relevant once `QUEUES.md`'s async path is adopted (currently unused - see "Status") |
| Workflows | Included with Workers Paid, usage-based beyond included volume | Workers Paid required | Only relevant once adopted (currently scaffolded, not deployed - see `WORKFLOWS.md`) |
| R2 | 10 GB storage + 1M Class A / 10M Class B operations/month free | Beyond free tier: per-GB storage + operations, **no egress fees** (R2's main cost advantage over S3-compatible alternatives) | Only relevant once adopted (see `R2_STORAGE.md` "Status") - exports/reports/support bundles are low-volume compared to typical R2 use cases |
| WAF / DNS | Included on the zone's plan (Free or Pro) | Pro plan ($20/mo/zone) adds more WAF rule slots if needed | Not required for anything in this migration to function, but recommended per `SECURITY.md` "Rate limiting and abuse" |

Reference: https://developers.cloudflare.com/workers/platform/pricing/,
https://developers.cloudflare.com/queues/platform/pricing/,
https://developers.cloudflare.com/workflows/platform/pricing/,
https://developers.cloudflare.com/r2/pricing/

## What this migration removes or avoids

- No new compute cost for the origin - the Go API/Postgres/Stalwart
  infrastructure is unchanged, just no longer needs a public-facing load
  balancer/firewall configuration in front of the Go API specifically
  (Cloudflare's edge replaces that role).
- No S3 egress fees if/when R2 is adopted for exports (R2 has zero egress
  fees by design, unlike S3).

## Cost control practices already in this repo

- `Cache-Control: no-store` on every API response (`EDGE_WORKER.md`) - not
  a cost optimization (API responses shouldn't be cached anyway), but worth
  noting it means Cloudflare's cache isn't absorbing any of this traffic;
  Worker request counts reflect real backend load 1:1.
- The domain-verification queue's exponential backoff (`QUEUES.md`) bounds
  retry volume rather than hammering DNS/the origin on every failed check.
- Feature flags (`EXPIRATION_SWEEP_MODE`) mean nothing here forces adopting
  a paid-tier-requiring product (Queues/Workflows) before it's actually
  needed.

## Rough monthly estimate at small scale (illustrative only)

For a low-hundreds-of-customers SaaS with a few requests/second peak:
Workers Paid plan ($5/mo base) likely covers everything in this migration
comfortably within included usage, since the free tier's 100k
requests/day threshold is per-day, not concurrent, and API request volume
at this scale rarely approaches it. Re-evaluate with real `MONITORING.md`
data once deployed - this estimate is not a substitute for that.
