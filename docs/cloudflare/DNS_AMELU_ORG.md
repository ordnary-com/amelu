# amelu.org DNS

What every record in the amelu.org zone is for. Each record in Cloudflare
also has a comment and tags (filter on `mail:*`, `web:*`, `kritiek`,
`host:marduk`). The four Worker records (api, app, beta, webmail) are
managed by Cloudflare and can't carry comments. Last reviewed 2026-11-01.

## Mail: receiving

| Record | Value | Notes |
|---|---|---|
| `amelu.org` MX 10 | marduk.mx.amelu.org | The only MX. |
| `marduk.mx.amelu.org` A | 141.95.52.66 | marduk itself (OVH). Receives; no longer sends. |
| `marduk.mx.amelu.org` A | 5.230.173.85 / .86 / .87 | noez GRE IPs on marduk. Here so customer SPF (`mx`) authorizes them; they also receive. |
| `marduk.mx.amelu.org` AAAA | 2001:41d0:701:1100::74d4 | marduk, IPv6. |

Customer domains point their MX at `marduk.mx.amelu.org` and use
`v=spf1 mx -all`, so every A/AAAA of that name is an allowed sender for
every customer. Adding or removing an IP there changes SPF for all of them.

## Mail: sending

| Record | Value | Used for |
|---|---|---|
| `out1.mx.amelu.org` | 5.230.173.85 | established customers |
| `out2.mx.amelu.org` | 5.230.173.86 | domains created in the last 7 days |
| `out3.mx.amelu.org` | 5.230.173.87 | amelu.org's own mail |

Each has `v=spf1 a -all` for its HELO name, and noez sets the PTR to the
same name. The choice per sender is made by `ops/marduk/amelu-ip-pools.py`.
marduk's PTR is `marduk.mx.amelu.org`.

## Mail: authentication and transport security

| Record | Notes |
|---|---|
| `amelu.org` TXT `v=spf1 mx -all` | |
| `_dmarc.amelu.org` | `p=quarantine`, reports to postmaster@. Keep exactly one record. |
| `v1-ed25519-20260711._domainkey`, `v1-rsa-20260711._domainkey` | DKIM keys Stalwart signs with. |
| `_mta-sts` TXT + `mta-sts` CNAME | MTA-STS policy served by marduk; bump `id` on change. |
| `_smtp._tls` | TLS-RPT to postmaster@. |
| `_25/_443/_465/_993/_995._tcp.marduk.mx` TLSA | DANE pins. Inert: DNSSEC is off for amelu.org. Update on certificate key change. |
| CAA (issue + 2× iodef) | Only the Let's Encrypt account may issue. |
| `_validation-persist` | Persistent Let's Encrypt validation for marduk's certificates. |

## Mail: client autoconfig

SRV records for caldavs, carddavs, imaps, jmap, pop3s and submissions, the
`autoconfig`/`autodiscover` CNAMEs, and `_ua-auto-config` +
`ua-auto-config` (Stalwart's signed autoconfig) all point at marduk.

## Web

| Record | Served by |
|---|---|
| `amelu.org`, `www` | Pages project amelu-landing |
| `app`, `beta` | Worker amelu-beta (2.0 dashboard) |
| `api` | edge Worker, reaching the Go API through `origin.amelu.org` (Cloudflare Tunnel) |
| `webmail` | Worker amelu-webmail, proxying Roundcube on marduk |

## Other

`google-site-verification` TXT: Google Search Console / Postmaster Tools.
