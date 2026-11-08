-- Domains whose DNS Amelu hosts: the customer points their nameservers at
-- ns1/ns2.amelu.org and Amelu keeps the zone (a Cloudflare zone in the
-- Ordnary account, using its account custom nameservers). A domain without
-- a row keeps its DNS wherever it is and adds the records by hand.
CREATE TABLE domain_dns_zones (
    domain_id    UUID PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
    zone_id      TEXT NOT NULL,
    nameservers  TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ
);
