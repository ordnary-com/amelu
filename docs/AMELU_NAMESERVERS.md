# Amelu nameservers

Customers can let Amelu host their domain's DNS instead of adding records
where their DNS lives. They pick "Amelu nameservers" on the add-domain page
(or "Use Amelu nameservers" on a domain's DNS page), point the domain at
ns1.amelu.org and ns2.amelu.org at their registrar, and every mail record is
set for them.

## How it works

- Each such domain is a Cloudflare zone (free plan) in the Ordnary account,
  switched to the account's custom nameserver set `AMELU_NS_SET`
  (ns1/ns2.amelu.org). That set is NOT the account default, so Ordnary's own
  zones keep their nameservers.
- On creation the backend (`internal/cfdns`, `internal/handlers/nameservers.go`):
  1. creates the zone and switches it to the Amelu set,
  2. runs Cloudflare's record scan to copy what the domain answers with today
     (website records keep working after the switch),
  3. writes the mail records from Stalwart's zone file plus the Outlook
     autodiscover SRV. They carry the comment "Managed by Amelu for email";
     MX, SPF, DMARC and same-name records that compete with them are removed.
- Mail records are read-only in the dashboard; everything else is editable on
  the domain's "DNS zone" tab. POST /api/domains/{id}/nameservers again puts
  missing mail records back.
- The zone stays "pending" until the registrar delegates; the DNS page polls
  GET /api/domains/{id}/nameservers, which asks Cloudflare and flips the zone
  to "active".
- Deleting the domain (customer, admin or account termination) deletes the zone.

## Setup (once)

1. API token in the Ordnary account with:
   - Account: Account Settings Edit (for custom nameservers)
   - Zone: Zone Edit, Zone: DNS Edit, Zone: DNS Settings Edit, scoped to all
     zones in the Ordnary account (zones are created on the fly, so a
     per-zone scope can't work).
2. Create the nameserver set (Cloudflare adds the A/AAAA records on amelu.org
   itself, since amelu.org is in the same account):

   ```
   POST /accounts/{account_id}/custom_ns {"ns_name": "ns1.amelu.org", "ns_set": 2}
   POST /accounts/{account_id}/custom_ns {"ns_name": "ns2.amelu.org", "ns_set": 2}
   ```

3. Secrets on the edge Worker (cloudflare/edge, --env production):
   `AMELU_DNS_API_TOKEN`, `AMELU_DNS_ACCOUNT_ID` (7ec0fe3ecec77fb348caecdecb0f6b30),
   optional `AMELU_NS_SET` (default 2) and `AMELU_NAMESERVERS`
   (default ns1.amelu.org,ns2.amelu.org). Bump the container instance name so
   the new env reaches the API. Without the token the option shows "Soon".
