# Dashboard Setup (one-time, manual)

Last verified against Cloudflare documentation: 2026-07-15.

These are the one-time, human-in-the-loop steps in the Cloudflare dashboard
that nothing in this repo can or should automate. Do these before following
`PAGES_FRONTEND.md`, `EDGE_WORKER.md`, or `TUNNEL.md`.

**Changes production state?** Adding the zone and enabling proxying change
how `amelu.org` resolves once nameservers are updated - see `DNS_AND_MAIL.md`
before touching nameservers. Everything else below (creating a Worker
project, a Tunnel, a Pages project) is inert until traffic is actually routed
to it.

## 1. Add the zone

Dashboard -> Add a site -> `amelu.org`. Choose the Free or Pro plan (either
works for everything in this migration). Cloudflare will show the
nameservers to set at the registrar - **do not update them yet**; that's the
DNS cutover step in `DNS_AND_MAIL.md`, done last, deliberately, with a
rollback plan ready.

Reference: https://developers.cloudflare.com/dns/zone-setups/

## 2. Create a Cloudflare API token (for CI and local wrangler use)

Dashboard -> My Profile -> API Tokens -> Create Token -> Custom token, with:

- Zone: DNS Edit, on the `amelu.org` zone (for the DNS steps only - not
  needed for Worker/Pages deploys).
- Account: Workers Scripts Edit, Pages Edit, Queues Edit, Workflows Edit,
  Cloudflare Tunnel Edit, Workers R2 Storage Edit.

Store the token as a GitHub Actions secret (`CLOUDFLARE_API_TOKEN`) and in
each engineer's local wrangler config - never in this repo. See
`SECRETS.md`.

Reference: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/

## 3. Note the Account ID

Dashboard -> right sidebar on any zone overview page, or Workers & Pages
overview. This is `${CF_ACCOUNT_ID}` everywhere in this repo's placeholders
- not a secret, but still never hardcoded (keeps configs portable across
environments/forks).

## 4. Create a Cloudflare Tunnel

Zero Trust dashboard -> Networks -> Tunnels -> Create a tunnel ->
Cloudflared. Name it (e.g. `amelu-origin`). Download the credentials JSON -
this is `${CF_TUNNEL_CREDENTIALS_FILE}`, a secret (see `TUNNEL.md` and
`SECRETS.md`).

Reference: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/

## 5. Create the Pages project

Workers & Pages -> Create -> Pages -> Connect to Git -> select
`ordnary-com/amelu`. Exact build settings are in `PAGES_FRONTEND.md` - don't
guess them here, that doc has the real command/output-dir from
`frontend/package.json`.

## 6. Create the Worker project (empty, deploy happens via CI/wrangler)

Workers & Pages -> Create -> Workers -> name it `amelu-edge-api`. The actual
code deploy is via `wrangler deploy` (see `EDGE_WORKER.md`, `DEPLOYMENT.md`),
gated behind a manual GitHub Actions approval - this dashboard step just
reserves the name and gives you a `*.workers.dev` URL to smoke-test against
before attaching the `api.amelu.org` custom domain.

## 7. Create the Queue and DLQ (if adopting `QUEUES.md`)

```
npx wrangler queues create amelu-domain-verification
npx wrangler queues create amelu-domain-verification-dlq
```

Run from `cloudflare/queues/domain-verification/` once, by a human, with
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` set locally. Not run by CI.

Reference: https://developers.cloudflare.com/queues/get-started/

## 8. Create the R2 bucket (if adopting `R2_STORAGE.md`)

Dashboard -> R2 -> Create bucket -> choose **EU jurisdiction** explicitly
(Location hint / Jurisdiction restriction) -> name it e.g.
`amelu-exports-eu`. See `R2_STORAGE.md` for lifecycle rule setup.

Reference: https://developers.cloudflare.com/r2/buckets/create-bucket/ and
https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions

## Verification

- Zone shows "Active" once nameservers are (eventually) updated - not
  required for any step before `DNS_AND_MAIL.md`.
- `npx wrangler whoami` from any `cloudflare/*` package succeeds and shows
  the right account.
- Tunnel shows "Inactive" (expected - no `cloudflared` process running yet)
  in Zero Trust -> Networks -> Tunnels.

## Common errors

- **"Authentication error [code: 10000]"** on any wrangler command - the API
  token is missing a required scope; re-check step 2 against the specific
  command's docs page.
- **Pages build fails on Node version** - confirm the Pages project's Node
  version setting matches `.nvmrc` (see `PAGES_FRONTEND.md`).

## Rollback

Every step here is additive and inert until wired up elsewhere (Worker
deployed, Tunnel run, DNS cut over). Removing a Cloudflare resource created
here (delete the Worker project / Tunnel / Pages project / Queue / bucket)
has no effect on production as long as `DNS_AND_MAIL.md`'s cutover hasn't
happened.
