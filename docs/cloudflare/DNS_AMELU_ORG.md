# amelu.org DNS

What every record in the amelu.org zone is for. Each record in Cloudflare
also has a comment and tags (filter on `mail:*`, `web:*`, `kritiek`,
`host:marduk`). The four Worker records (api, app, beta, webmail) are
managed by Cloudflare and can't carry comments. Last reviewed 2026-11-01.

## Mail: receiving

| Record | Value | Notes |
|---|---|---|
| `amelu.org` MX 10 | marduk.mx.amelu.org | The only MX. |
| `marduk.mx.amelu.org` A | 89.106.70.1-8 (`out-N.mta0.amelu.org`) | Our own block (AS218905), carried to marduk (Hetzner) over WireGuard by the routers. They send and receive; here so customer SPF `mx` authorizes them. Since 2026-11-18 the only addresses (the OVH ones and marduk's old IPv6 were removed when marduk moved). |
| `_spf.amelu.org` TXT | `v=spf1 ... ip4:89.106.70.0/24 -all` | Every IP that may send. The OVH entries go once their IPs are cancelled. |

Customer domains point their MX at `marduk.mx.amelu.org`. Their SPF is
`v=spf1 include:_spf.amelu.org -all` since 2026-11-08 (the dashboard asks for
it, Amelu-hosted zones get it); older domains have `v=spf1 mx -all`, which
the DNS check still accepts. Both must keep working, so a sending IP is
always in `_spf.amelu.org` AND an A record of `marduk.mx.amelu.org`
(amelu-ip-pools only uses an IP 2 hours after it appears in marduk.mx, and
warns when `_spf.amelu.org` misses one).

## Mail: sending

| Record | Value | Group (`ops/marduk/amelu-ip-pools.py`) |
|---|---|---|
| `out4.mx.amelu.org` | 51.89.39.34 | system (amelu.org's own mail) |
| `out2.mx.amelu.org` | 51.89.60.49 | system |
| `out1.mx.amelu.org` | 51.89.60.60 | trusted |
| `out5.mx.amelu.org` | 51.89.2.193 | trusted |
| `out8.mx.amelu.org` | 51.89.76.15 | trusted |
| `out9.mx.amelu.org` | 51.89.85.197 | trusted (warming up since 2026-11-08) |
| `out3.mx.amelu.org` | 51.89.76.2 | newdomains (domains created in the last 7 days) |
| `out6.mx.amelu.org` | 51.89.1.228 | newdomains |
| `out7.mx.amelu.org` | 51.89.102.29 | newdomains |
| `out10.mx.amelu.org` | 51.89.85.192 | newdomains (warming up since 2026-11-08) |
| `out11.mx.amelu.org` | 51.89.76.0 | spare, not in marduk.mx (a .0 address some receivers refuse) |

No group has two IPs in the same /24, so a range block (Outlook S3140)
takes one IP out of a group, not a group. Each has `v=spf1 a -all` for its
HELO name, and the PTR is set to the same name in the OVH panel.
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
