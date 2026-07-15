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
| Tunnel/`cloudflared` | Stop `cloudflared`, temporarily re-enable a public Go listener + repoint DNS | No | `TUNNEL.md` "Emergency rollback" |
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

## Full migration rollback (worst case)

If the entire Cloudflare migration needs to be reversed after a DNS
cutover:

1. `DNS_AND_MAIL.md` "Rollback" - revert nameservers, mail is unaffected
   throughout.
2. Re-enable the Go API's public HTTP listener (remove/bypass the Tunnel
   requirement - the Go binary itself never required a Tunnel to run, this
   is a deployment/network config change, not a code change).
3. Point the frontend's `VITE_API_URL` back at the direct API host and
   rebuild/redeploy it via its previous hosting method.
4. Stop `cloudflared` processes.
5. Leave Cloudflare-side resources (Worker, Pages project, Tunnel, Queues,
   R2 bucket) in place but idle - they cost nothing meaningful while unused
   (see `COSTS.md`) and deleting them isn't necessary for the rollback to be
   complete.

Every step above is reversible again (re-doing the migration is just
following `README.md`'s order again) since no data was migrated
irreversibly at any point - Postgres, Stalwart, and mailbox storage were
never touched.

## What can't be "rolled back" because it was never risky to begin with

- Documentation changes (this `docs/cloudflare/` directory) - no runtime
  effect either direction.
- `cloudflare/terraform/` templates - never applied (safety rule #13), so
  there's nothing to roll back.
- The `objectstore` package's `LocalStore` - purely additive, no existing
  code path was changed to use it.
