# Operations

Last verified against Cloudflare documentation: 2026-07-15.

Day-to-day operational reference once this migration is deployed.

## Routine checks

| Check | Command/location | Expected |
|---|---|---|
| Edge health | `curl https://api.amelu.org/healthz` | `{"status":"ok",...}` |
| Origin health via edge | `curl https://api.amelu.org/healthz/upstream` | `{"status":"ok"}` (proxied from the Go origin) |
| Tunnel connector status | Zero Trust dashboard -> Networks -> Tunnels, or `cloudflared tunnel info amelu-origin` | All replicas "Connected" |
| Worker error rate | Workers & Pages -> amelu-edge-api -> Metrics | Near zero 5xx outside of deploys |
| Queue backlog | Queues dashboard -> amelu-domain-verification | Near zero (messages should drain within minutes) |
| DLQ depth | Queues dashboard -> amelu-domain-verification-dlq | Any growth warrants investigation - see `QUEUES.md` |

## Rotating a Worker-to-origin secret without downtime

See `SECRETS.md` for the exact rotation procedure - the ordering (origin
first, then Worker, then redeploy) matters: rotating the Worker's secret
first would cause the Worker to sign requests with a value the origin
doesn't recognize yet.

## Disabling the in-process ticker in favor of the Workflow trigger

1. Deploy `cloudflare/workflows/mailbox-expiration` (`DEPLOYMENT.md`).
2. Verify it successfully calls `/internal/jobs/expiration-sweep` (check
   origin logs for `"internal job: expiration sweep triggered externally"`).
3. Set `EXPIRATION_SWEEP_MODE=external` on the origin and restart.
4. Confirm the origin's startup log no longer shows the ticker starting,
   and instead shows `"expiration sweep: in-process ticker disabled"`.

See `WORKFLOWS.md` "Disabling" for the reverse.

## Handling a stuck domain verification (DLQ)

1. Inspect `amelu-domain-verification-dlq` messages (dashboard message
   browser, or a temporary debug consumer).
2. For each, manually run the same DNS check the customer would see in the
   dashboard ("check DNS" button, backed by `internal/dnscheck`) to confirm
   whether the record is actually still missing/wrong.
3. If the customer has since fixed their DNS, either wait for them to
   re-trigger the synchronous check, or (once adopted per `QUEUES.md`
   "Status") re-enqueue with a fresh message.
4. If Amelu's DoH lookup itself was failing (not the customer's DNS),
   that's a bug - file it, the DLQ isn't self-healing.

## Handling a Stalwart provisioning failure

Not applicable yet - the async Workflow isn't adopted (`WORKFLOWS.md`
"Status"). The existing synchronous path's failure mode is unchanged:
`CreateDomain` returns a 502 to the customer and marks the domain `failed`
with `last_error` set (`internal/handlers/domains.go`) - operator follow-up
is the same as before this migration.

## Incident: Tunnel down

Symptoms: `GET /healthz` (edge) still 200, `GET /healthz/upstream` and all
proxied API calls 502.

1. Check `cloudflared` process/container status on the origin host(s).
2. Check origin host network connectivity outbound (the tunnel connection
   is outbound-only from the origin).
3. Restart `cloudflared` (`systemctl restart cloudflared` or
   `docker compose restart`).
4. If unresolvable quickly, see `ROLLBACK.md` for reverting to a public Go
   API listener as a stopgap.

## Incident: Edge Worker misconfigured/failing

Symptoms: `GET /healthz` itself failing, or 500 "edge worker is
misconfigured" (from the explicit binding-presence check in
`cloudflare/edge/src/index.ts`).

1. `npx wrangler rollback --env production` to the last known-good deploy.
2. Check `wrangler secret list --env production` shows all three required
   secrets present (values aren't shown, only names).

## Log locations

- Worker logs: `npx wrangler tail --env production` (live) or Workers &
  Pages -> amelu-edge-api -> Logs (Cloudflare's dashboard log viewer, if
  enabled).
- Queue consumer logs: `npx wrangler tail` from
  `cloudflare/queues/domain-verification`.
- Origin (Go) logs: wherever the origin process's stdout/stderr is
  captured today - unchanged by this migration.

Reference: https://developers.cloudflare.com/workers/observability/logs/

## Support bundle generation (once R2_STORAGE.md is adopted)

Not implemented yet - see `R2_STORAGE.md` "Status". Once adopted, an
operator-triggered support bundle export would use the same
`objectstore.Store` interface as customer-facing exports, just with an
operator-only handler and audience.
