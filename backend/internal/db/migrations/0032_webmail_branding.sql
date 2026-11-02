-- White-label webmail (docs/WEBMAIL.md): an organization's own webmail
-- address and branding. Roundcube asks for the branding by hostname, the
-- dashboard's "Open in webmail" sends the organization's mailboxes there.

ALTER TABLE plan_tiers ADD COLUMN webmail_branding BOOLEAN NOT NULL DEFAULT false;
UPDATE plan_tiers SET webmail_branding = true WHERE id IN ('go', 'pro');

CREATE TABLE organization_webmail (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    enabled         BOOLEAN NOT NULL DEFAULT false,
    -- <subdomain>.webmail.amelu.org, works without any DNS on the customer's side.
    subdomain       TEXT UNIQUE,
    -- The customer's own name (webmail.example.com), a Cloudflare custom
    -- hostname plus a Worker route for it; status mirrors Cloudflare's.
    custom_hostname        TEXT UNIQUE,
    custom_hostname_id     TEXT NOT NULL DEFAULT '',
    custom_route_id        TEXT NOT NULL DEFAULT '',
    custom_hostname_status TEXT NOT NULL DEFAULT '', -- pending, active, failed
    custom_hostname_error  TEXT NOT NULL DEFAULT '',
    product_name    TEXT NOT NULL DEFAULT '',
    accent_color    TEXT NOT NULL DEFAULT '',
    support_url     TEXT NOT NULL DEFAULT '',
    logo            BYTEA,
    logo_type       TEXT NOT NULL DEFAULT '',
    logo_updated_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
