# Mail client setup (autoconfig)

The Worker `amelu-autoconfig` (`cloudflare/autoconfig`) serves mail client
settings for every Amelu mailbox, whatever its domain, on two hostnames of
our own: `autoconfig.amelu.org` and `autodiscover.amelu.org`. Every answer is
the same server settings with the address filled in: IMAP on
`marduk.mx.amelu.org:993` and SMTP on `:465`, both implicit TLS, the full
address as username. Passwords are never part of it; the client asks.
Calendars and contacts are Stalwart's CalDAV and CardDAV on the same host
(`https://marduk.mx.amelu.org/dav/cal/` and `/dav/card/`, principal
`/dav/pal/<address>/`): the Thunderbird config lists them as `calendar` and
`addressBook`, and the Apple profile carries a CalDAV and a CardDAV payload
next to the mail account, so one install sets up all three.

| Path | For |
| --- | --- |
| `GET /mail/config-v1.1.xml?emailaddress=` (and `/.well-known/autoconfig/...`) | Thunderbird's format. Without an address it uses `%EMAILADDRESS%`. |
| `POST /autodiscover/autodiscover.xml` | Outlook's POX autodiscover, address from `<EMailAddress>`. |
| `GET /profile.mobileconfig?email=&name=` | An Apple configuration profile (iPhone, iPad, Mac). The UUIDs come from the address, so installing it again replaces the account. |

## Why not Stalwart's own records

Stalwart's zone file has `autoconfig.` and `autodiscover.` CNAMEs to marduk
for every customer domain, but marduk has no certificate for those names, so
clients refuse them. `stalwart.FilterTLSIncompatibleRecords` leaves them out
of the DNS page. A Worker can't present a certificate for a customer's
hostname either, so customers don't CNAME to it.

## How each client finds it

- **Apple**: the dashboard's Usage instructions page (per mailbox) links to
  the profile. The profile is unsigned, so iOS shows it as unverified.
- **Outlook**: an SRV record on the customer's domain,
  `_autodiscover._tcp.<domain>. SRV 0 0 443 autodiscover.amelu.org.`, which
  Outlook follows to our certificate (it asks once whether to trust the
  redirect). Shown on the Usage instructions page and added to the zone file
  download (`GetDomainBindFile`). It is not among the records the DNS check
  requires, so domains without it stay active.
- **Thunderbird**: looks up the MX (`marduk.mx.amelu.org`) and then Mozilla's
  ISPDB for `amelu.org`. Until amelu.org is in the ISPDB, Thunderbird users
  enter the settings by hand.

## Deploy

```
cd cloudflare/autoconfig && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy
```

`autoconfig.amelu.org` and `autodiscover.amelu.org` used to be CNAMEs to
marduk (from amelu.org's own Stalwart records, broken for the same
certificate reason); they have to be deleted before the Worker's custom
domains can take the names.
