# Rollback

Last verified against Cloudflare documentation: 2026-07-15.

Consolidated rollback reference - each piece links back to the doc with
full detail. Every migration step in this repo was designed to have an
independent, non-destructive rollback; nothing here requires a data
migration to reverse.

## Quick reference

| Piece | Rollback action | Data migration needed? | Detail |
|---|---|---|---|
| `go-sieve` module pin | `git revert` the commit; if a working local replace is truly needed again, re-add the `replace` directive locally (never commit it) | No | This doc, "go-sieve" below |
| `EXPIRATION_SWEEP_MODE=external` | Set back to `ticker` (or unset), restart origin | No - `RunExpirationSweep` is the same function either way | `WORKFLOWS.md` "Disabling" |
| Edge Worker deploy | `npx wrangler rollback --env production` | No | `EDGE_WORKER.md` "Rollback" |
| Pages deploy | Dashboard "Rollback to this deployment" | No | `PAGES_FRONTEND.md` "Rollback" |
| Containers cutover (Worker routing to `AmeluOriginContainer`) | **No VPS/Tunnel fallback exists anymore (decommissioned 2026-07-18)** - a regression must be fixed forward on the Containers setup, or via `npx wrangler rollback --env production` to a previous Worker version if one still built successfully | No | `EDGE_WORKER.md`, this doc's "Full migration rollback" |
| Neon cutover (`DATABASE_URL`) | **No original Postgres to fall back to (decommissioned along with the VPS)** - a regression must be fixed forward against Neon (e.g. via Neon's own point-in-time restore/branching) | No - nothing was migrated between databases in the first place (Neon started empty) | `ARCHITECTURE.md` |
| DNS cutover (whole zone) | Revert nameservers at the registrar | No - mail records/IPs never changed | `DNS_AND_MAIL.md` "Rollback" |
| `ORIGIN_SHARED_SECRET`/`INTERNAL_JOBS_SHARED_SECRET` rotation | Set the previous value back on both sides if a rotation broke something before completing | No | `SECRETS.md` |
| Queue consumer deploy | `wrangler delete` or simply stop enqueuing (nothing depends on it yet) | No | `QUEUES.md` "Rollback" |
| Workflow deploy | Same - not adopted by any code path yet | No | `WORKFLOWS.md` "Rollback" |
| `objectstore`/R2 adoption (future) | Flip the `config.Load` branch back to `LocalStore` | No, unless in-flight signed URLs pointed at R2 need to be treated as invalid | `R2_STORAGE.md` "Rollback" |
| `EdgeAuth` middleware | Unset `ORIGIN_SHARED_SECRET` on the origin - the middleware becomes a no-op passthrough | No | `SECURITY.md` |

## go-sieve

If the pinned `v1.1.2` module version ever needs to be reverted to a local
checkout for active development on `go-sieve` itself:

```
go mod edit -replace github.com/migadu/go-sieve=/path/to/local/go-sieve
go build ./...
```

**Never commit this replace directive** - it broke reproducible builds
before, which is exactly what this migration fixed. Use it locally only,
and `git checkout backend/go.mod backend/go.sum` before committing anything
else.

## Full migration rollback (worst case) - superseded

The Tunnel+VPS-era version of this section (re-enable the VPS's public
listener, stop `cloudflared`, point the frontend back at a direct API
host) **no longer applies** - the Hetzner VPS and its self-hosted Postgres
were decommissioned on 2026-07-18, after the Containers + Neon cutover
was verified healthy in production. There is no "revert to the old
infra" path anymore.

If a serious regression surfaces on the Containers/Neon setup now, the
available options are:

1. `npx wrangler rollback --env production` to the last known-good Worker
   deployment (only helps for a bad Worker/edge-code change, not a bad
   Container image or a Neon-side issue).
2. Fix forward: patch the Go origin or the Container config and redeploy
   (`DEPLOYMENT.md`).
3. For a Neon-side issue: use Neon's own point-in-time restore / branching
   from the dashboard - there's no second Postgres to fail over to.
4. `DNS_AND_MAIL.md` "Rollback" still applies independently for a DNS/zone-
   level problem - mail is unaffected either way.

## What can't be "rolled back" because it was never risky to begin with

- Documentation changes (this `docs/cloudflare/` directory) - no runtime
  effect either direction.
- `cloudflare/terraform/` templates - never applied (safety rule #13), so
  there's nothing to roll back.
- The `objectstore` package's `LocalStore` - purely additive, no existing
  code path was changed to use it.
