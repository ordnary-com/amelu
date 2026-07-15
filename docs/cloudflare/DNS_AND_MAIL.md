# DNS and Mail Safety

Last verified against Cloudflare documentation: 2026-07-15.

**This is the highest-risk document in this migration.** A misconfigured
record here can take mail delivery down for the whole platform. Read this
document in full before changing anything, and do the cutover during a
low-traffic window with the rollback plan (bottom of this doc) already
copy-pasted somewhere ready to run.

Placeholders used throughout: `${MAIL_IP_1..3}` (mail server public IPv4
addresses), `${MAIL_HOST_1..3}` (mail server hostnames, e.g.
`mx1.amelu.org`), `${WEB_ORIGIN_IP}` (only relevant if something other than
Pages/Workers serves a proxied record's origin).

## The one rule that matters most

**Every record involved in mail delivery or mail authentication is
DNS-only (grey cloud in the Cloudflare dashboard), never proxied (orange
cloud).** Proxying rewrites the record to point at Cloudflare's anycast IPs
for HTTP(S) traffic only - SMTP/IMAP/POP3 don't speak HTTP, so a proxied
mail record simply breaks mail delivery; it isn't a security improvement
Cloudflare offers for these protocols, so there's never a reason to proxy
them here.

## Records, individually evaluated

| Record | Type | Value | Proxy status | Why |
|---|---|---|---|---|
| `amelu.org` | A | `${WEB_ORIGIN_IP}` or Pages-managed | **Proxied** | Marketing/root site, HTTP(S) only |
| `app.amelu.org` | CNAME | Pages-managed | **Proxied** | Dashboard, HTTP(S) only. Auto-created by Pages custom domain (`PAGES_FRONTEND.md`) |
| `api.amelu.org` | CNAME | Worker custom domain | **Proxied** | Edge Worker, HTTP(S) only |
| `status.amelu.org` | CNAME/A | status page host | **Proxied** | HTTP(S) only |
| `mail.amelu.org` | A/AAAA | `${MAIL_IP_1}` | **DNS-only** | Webmail/mail-related host if it exists, but resolved by mail clients, not browsers, via IMAP/SMTP config - never assume "has 'mail' in the name" implies safe to proxy |
| `mx1.amelu.org`, `mx2.amelu.org`, `mx3.amelu.org` | A | `${MAIL_IP_1..3}` | **DNS-only** | Targets of MX records - SMTP speaks directly to these IPs |
| `amelu.org` | MX | `${MAIL_HOST_1}` (priority 10), `${MAIL_HOST_2}` (priority 20), `${MAIL_HOST_3}` (priority 30) | **N/A (MX has no proxy option)** | Lower priority number = preferred. See "MX priorities" below |
| `amelu.org` | TXT (SPF) | `v=spf1 mx a:${MAIL_HOST_1} a:${MAIL_HOST_2} a:${MAIL_HOST_3} -all` | **DNS-only** | SPF is evaluated by receiving mail servers doing DNS lookups, never through a browser/HTTP path |
| `<selector>._domainkey.amelu.org` (per customer domain, at their registrar - not this zone) | TXT (DKIM) | Stalwart-generated public key | **DNS-only** (customer's own zone) | See `internal/stalwart/zonefile.go` for how Amelu generates the expected value per domain |
| `_dmarc.amelu.org` | TXT (DMARC) | `v=DMARC1; p=quarantine; rua=mailto:dmarc@amelu.org` | **DNS-only** | Same reasoning as SPF |
| `_mta-sts.amelu.org` | TXT | `v=STSv1; id=<unique-id>` | **DNS-only** | Points mail servers at the MTA-STS policy file |
| `mta-sts.amelu.org` | CNAME/A | policy file host | **DNS-only** | The policy file itself is served over HTTPS, but MTA-STS validation is strict about the exact hostname resolving consistently - keep DNS-only to avoid Cloudflare's anycast IPs (shared across many customers) appearing in a policy meant to pin this specific mail infrastructure |
| `_smtp._tls.amelu.org` | TXT (TLS-RPT) | `v=TLSRPTv1; rua=mailto:tlsrpt@amelu.org` | **DNS-only** | Reporting-only record, evaluated by receiving mail servers |
| `autoconfig.amelu.org` | CNAME/A | mail server or config host | **DNS-only** | Thunderbird-style autoconfig - fetched by mail clients, not browsers, but still keep DNS-only since it's part of the mail onboarding chain, not the web app |
| `autodiscover.amelu.org` | CNAME/A | mail server or config host | **DNS-only** | Outlook-style autodiscover, same reasoning |
| `_autodiscover._tcp.amelu.org` | SRV | mail server | **DNS-only (SRV has no proxy option)** | |
| `_submission._tcp.amelu.org` | SRV | `${MAIL_HOST_1}:587` | **DNS-only** | SMTP submission |
| `_imaps._tcp.amelu.org` | SRV | `${MAIL_HOST_1}:993` | **DNS-only** | |
| `_pop3s._tcp.amelu.org` | SRV | `${MAIL_HOST_1}:995` | **DNS-only** | |
| `amelu.org` | CAA | `0 issue "letsencrypt.org"` (or actual CA) | **N/A (CAA has no proxy option)** | Controls which CAs may issue certs for the zone - keep in sync with whatever issues certs for both the proxied web records and the DNS-only mail records' own TLS |

Every record's proxy status is an individual decision in the table above -
there is no "proxy everything under this zone" toggle used here, precisely
because a zone-wide setting would eventually catch a mail record by
mistake.

## MX priorities

Lower number wins. `${MAIL_HOST_1}` at priority 10 is preferred; `2` and `3`
at 20/30 are failover targets, used only if `1` is unreachable per standard
MX fallback behavior - not related to Cloudflare in any way, this is base
SMTP behavior.

## A/AAAA and PTR/rDNS

Each `${MAIL_HOST_N}` needs a matching PTR (reverse DNS) record at whichever
provider hosts `${MAIL_IP_N}` - **not configured in Cloudflare**, since
Cloudflare doesn't own the IP space these mail servers run on (unless
Cloudflare Magic Transit/BYOIP is in use, which it isn't here). Verify with:

```
dig -x ${MAIL_IP_1} +short
# expect: mx1.amelu.org. (or equivalent, matching the A record)
```

Mismatched or missing PTR records are one of the most common reasons
receiving mail servers reject or spam-flag mail - verify this before and
after any change here, unrelated to Cloudflare specifically.

## FCrDNS (Forward-Confirmed reverse DNS)

Confirms `${MAIL_HOST_N}` resolves to `${MAIL_IP_N}` (forward) AND
`${MAIL_IP_N}` resolves back to `${MAIL_HOST_N}` (reverse, i.e. PTR) -
both directions must agree:

```
dig ${MAIL_HOST_1} +short          # forward: expect ${MAIL_IP_1}
dig -x ${MAIL_IP_1} +short         # reverse: expect ${MAIL_HOST_1}.
```

## HELO/EHLO consistency

Stalwart's configured HELO/EHLO hostname (outside the scope of this repo's
DNS - a Stalwart config value) should match `${MAIL_HOST_1}` and have a
consistent, resolvable A record - many receiving servers check this against
the connecting IP's PTR record as part of spam filtering.

## Validation commands

```
# MX
dig amelu.org MX +short

# SPF
dig amelu.org TXT +short | grep spf1

# DKIM (per customer domain, using the selector from
# internal/stalwart/zonefile.go's generated zone file)
dig <selector>._domainkey.<customer-domain> TXT +short

# DMARC
dig _dmarc.amelu.org TXT +short

# MTA-STS
dig _mta-sts.amelu.org TXT +short
curl -sv https://mta-sts.amelu.org/.well-known/mta-sts.txt

# TLS-RPT
dig _smtp._tls.amelu.org TXT +short

# CAA
dig amelu.org CAA +short

# DNSSEC (if enabled on the zone - Cloudflare supports it per-zone)
dig amelu.org DNSKEY +short
dig amelu.org +dnssec

# Live SMTP TLS check
openssl s_client -connect ${MAIL_HOST_1}:587 -starttls smtp -crlf

# Live IMAP TLS check
openssl s_client -connect ${MAIL_HOST_1}:993

# SMTP banner / EHLO
echo -e "EHLO test.example\r\nQUIT\r\n" | openssl s_client -connect ${MAIL_HOST_1}:25 -crlf -quiet
```

## DNSSEC

If enabling DNSSEC on the zone (Cloudflare's dashboard toggle, per-zone),
this affects the whole zone including mail records - a DNSSEC
misconfiguration can cause SERVFAIL for MX lookups just as easily as for
web records. Verify with `dig +dnssec` above after enabling, and understand
that DNSSEC changes at the registrar (DS record) have their own propagation
delay independent of everything else in this doc.

Reference: https://developers.cloudflare.com/dns/dnssec/

## Zero-downtime cutover procedure

1. Add every record above to the Cloudflare zone (`DASHBOARD_SETUP.md` step
   1) **before** changing nameservers at the registrar - Cloudflare lets you
   populate a zone's records ahead of time.
2. Cloudflare's initial zone scan usually imports existing records
   automatically - **verify every mail record's proxy status individually
   after the scan**; don't trust the auto-import to have gotten proxy
   status right, since Cloudflare's scanner sometimes defaults ambiguous
   records to proxied.
3. Run every `dig`/`openssl` command above against Cloudflare's assigned
   nameservers directly (before the registrar cutover) to confirm the zone
   is correct in isolation:
   ```
   dig @<cloudflare-nameserver> amelu.org MX +short
   ```
4. Lower the TTL on the registrar's current NS/glue records at least 24-48
   hours before cutover, if the current provider allows it, to speed up
   eventual rollback if needed.
5. Update nameservers at the registrar to Cloudflare's assigned ones.
6. Monitor propagation (`dig NS amelu.org` from multiple resolvers/locations)
   and mail delivery specifically - send test mail through the new path
   continuously during the propagation window, not just once.
7. Once propagated and mail flow confirmed unaffected, proceed with
   `PAGES_FRONTEND.md`/`EDGE_WORKER.md`'s custom domain attachment for the
   web-facing records - these can happen after mail is confirmed stable,
   since they're independent record types.

Mail delivery has effectively zero downtime in this procedure because MX
records and the mail server IPs never change - only the DNS *hosting*
provider changes, and mail records are reproduced identically (DNS-only) at
the new host before cutover.

## Rollback

1. Revert nameservers at the registrar to the previous provider's
   nameservers.
2. Confirm the previous provider's zone still has the original records
   (don't delete them there as part of migration prep) - propagation of the
   rollback follows the same timing as the original cutover.
3. Web-facing records (Pages/Worker custom domains) simply stop resolving
   through Cloudflare once nameservers revert - no separate action needed
   there, but the frontend/API would need to be reachable via the old
   infrastructure again (see `EDGE_WORKER.md`/`PAGES_FRONTEND.md` rollback
   sections) for the site to keep working during rollback.
4. Mail is unaffected by this rollback specifically, since MX targets/IPs
   never changed - only the authoritative DNS host reverts.

## References

- DNS: https://developers.cloudflare.com/dns/
- Proxy status: https://developers.cloudflare.com/dns/proxy-status/
- SPF/DKIM/DMARC record patterns (Cloudflare Email Routing docs, general
  reference even though this migration doesn't use Email Routing itself):
  https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/
- DNSSEC: https://developers.cloudflare.com/dns/dnssec/
