# Cloudflare Tunnel

**Historical.** The origin now runs as a Cloudflare Container bound
directly to the edge Worker (see `ARCHITECTURE.md`, `EDGE_WORKER.md`) -
this Tunnel+VPS setup is no longer the live path. Kept here, and the VPS
kept warm, as the documented rollback target for a defined bake period
after the Containers cutover (see `ROLLBACK.md`); safe to remove once that
window has passed with no rollback needed.

Last verified against Cloudflare documentation: 2026-07-15.

Config templates: `cloudflare/tunnel/config.yml.example`,
`docker-compose.yml.example`, `cloudflared.service.example`.

## Purpose

Removes the Go API's public HTTP listener entirely. `cloudflared` makes an
outbound-only connection from the origin host to Cloudflare - there is no
inbound port to firewall, scan, or accidentally expose. Target flow:

```
Client -> Cloudflare WAF -> Edge Worker -> Cloudflare Tunnel -> Go API
```

No public HTTP port on the Go API. SMTP/IMAP/POP3/ManageSieve/MX traffic is
never routed through this tunnel - see `DNS_AND_MAIL.md`.

Reference: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

## Tunnel creation

Done once, by a human, per `DASHBOARD_SETUP.md` step 4:

```
cloudflared tunnel login
cloudflared tunnel create amelu-origin
```

This writes a credentials JSON file (`${CF_TUNNEL_CREDENTIALS_FILE}`) and
prints the tunnel ID (`${CF_TUNNEL_ID}`). Route a hostname to it:

```
cloudflared tunnel route dns amelu-origin ${TUNNEL_PUBLIC_HOSTNAME}
```

`${TUNNEL_PUBLIC_HOSTNAME}` (e.g. `origin.internal.amelu.org`) is the
private hostname the edge Worker's `ORIGIN_BASE_URL` points at - "public"
here only means "has a DNS name", not "reachable by browsers"; it should
not be linked from anywhere and ideally sits behind an additional Access
policy (see "Locking the tunnel hostname down" below).

Reference: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/local-tunnel-configuration/

## Token/credential handling

The credentials JSON is a secret (see `SECRETS.md`) - never committed.
`config.yml.example` references it via `credentials-file:` and
`${CF_TUNNEL_ID}`; the real `config.yml` (not committed - see
`cloudflare/tunnel/` has no `.gitignore` needed since only `.example` files
are ever added here) fills in real values on the origin host only.

## Running via Docker Compose

```
cd cloudflare/tunnel
cp config.yml.example config.yml        # fill in real values, don't commit
cp docker-compose.yml.example docker-compose.yml
docker compose up -d
```

Two replicas defined by default (`cloudflared-1`, `cloudflared-2`) - see
"Multiple replicas" below.

## Running via systemd

```
sudo cp cloudflared.service.example /etc/systemd/system/cloudflared.service
sudo cp config.yml.example /etc/cloudflared/config.yml   # fill in real values
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
```

Reference: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/deploy-tunnels/deployment-guides/

## Private origin hostname

`config.yml`'s `ingress` maps `${TUNNEL_PUBLIC_HOSTNAME}` to
`http://${ORIGIN_LOCAL_ADDR}` (e.g. `http://go-api:8081` inside the Docker
network, or `http://127.0.0.1:8081` for the systemd/bare-metal case). The Go
API listens on this address only - never `0.0.0.0` bound to a public
interface in production. It also never publishes a container port to the
host in the Compose example.

## Worker-to-origin auth

Two layers, deliberately not one:

1. **Network**: only `cloudflared` (this tunnel) can reach the origin's
   private address at all - nothing else on the internet has a route to it.
2. **Application**: every request must carry a valid `X-Origin-Shared-Secret`
   header, HMAC-signed by the edge Worker (`cloudflare/edge/src/sign.ts`)
   and verified by `backend/internal/handlers/edge_auth.go`
   (`EdgeAuth` middleware). This means even a Tunnel misconfiguration that
   somehow exposed the origin wouldn't grant an attacker a working API -
   see `SECURITY.md`.

`/internal/*` routes (queue/workflow-triggered jobs) use a *different*
secret and header (`X-Amelu-Internal-Signature`, `INTERNAL_JOBS_SHARED_SECRET`)
since Queue/Workflow Workers call the origin directly over the tunnel,
bypassing the edge Worker entirely - `EdgeAuth` exempts `/internal/` paths
for exactly this reason. See `QUEUES.md`, `WORKFLOWS.md`, `SECRETS.md`.

## Locking the tunnel hostname down further (recommended, not implemented here)

For defense in depth beyond `EdgeAuth`, bind a Cloudflare Access policy or
service token to `${TUNNEL_PUBLIC_HOSTNAME}` so only the edge Worker's
service token (or a small allowlist of Queue/Workflow service tokens) can
reach it at all, even before the HMAC check runs. Not configured by this
migration - a dashboard/Zero Trust policy, not code - documented here as
the recommended next hardening step.

Reference: https://developers.cloudflare.com/cloudflare-one/policies/access/

## Firewall rules

The origin host's own firewall should still deny inbound traffic on the Go
API's port from anything other than `localhost`/the Docker network
`cloudflared` runs in - the Tunnel replacing the public listener is the
primary control, the host firewall is the backstop if `cloudflared` is ever
misconfigured to bind differently than expected.

## Health checking

- `GET /api/healthz` on the Go origin (added in this migration, see
  `backend/internal/handlers/internal_jobs.go`) - unauthenticated, no DB
  dependency, polled by `cloudflared`'s own origin health checks and by the
  edge Worker's `GET /healthz/upstream`.
- `cloudflared tunnel info amelu-origin` shows connector status.
- Zero Trust dashboard -> Networks -> Tunnels shows each replica's
  connection state in real time.

## Multiple replicas

Run 2+ `cloudflared` processes (containers or systemd units on separate
hosts) pointed at the *same* tunnel credentials. Cloudflare automatically
load-balances across all connected replicas and routes around a replica
that disconnects - no leader election or extra config needed. See
`docker-compose.yml.example`'s two-service setup and
`cloudflared.service.example`'s comment on running it on multiple hosts.

Reference: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/many-cfd-one-tunnel/

## Failure behavior

- If all `cloudflared` replicas disconnect, the edge Worker's proxied
  requests start failing with 502 (`stableErrorResponse` in
  `cloudflare/edge/src/proxy.ts`) and `GET /healthz/upstream` reflects it -
  `GET /healthz` (edge-only) still returns 200, correctly distinguishing
  "edge is fine, origin is not" for monitoring.
- The Go API itself is unaffected - it doesn't know or care whether a
  Tunnel is connected; a `cloudflared` outage is purely a connectivity
  problem, not a data-loss one.

## Proving direct origin access is blocked

From outside the origin's private network:

```
curl -v http://${ORIGIN_LOCAL_ADDR}:8081/api/healthz
# expect: connection refused / timeout - no route exists
```

From the tunnel hostname, without the signed header:

```
curl -v https://${TUNNEL_PUBLIC_HOSTNAME}/api/healthz
# expect: reaches the origin (health check has no auth), but any
# non-healthz route returns 401 without X-Origin-Shared-Secret,
# proving EdgeAuth is doing its job even if the hostname is somehow reached
curl -v https://${TUNNEL_PUBLIC_HOSTNAME}/api/me
# expect: 401 {"error":"unauthorized"}
```

## Emergency rollback

Stop all `cloudflared` replicas (`docker compose down` /
`systemctl stop cloudflared`), then either:

- Temporarily re-enable the Go API's public listener and repoint DNS
  directly at it (pre-migration state) - see `ROLLBACK.md` for the exact
  DNS steps, or
- If only the Worker/Tunnel path is broken but DNS hasn't been cut over yet,
  there's nothing to roll back - the old path was never removed.
