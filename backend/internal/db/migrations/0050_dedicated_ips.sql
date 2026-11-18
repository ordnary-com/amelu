-- Sending IPs reserved for one organization: the inventory staff add from our
-- own block, and which organization each is assigned to. marduk's
-- amelu-ip-pools reads the assignments (GET /internal/jobs/dedicated-ips) and
-- sends that organization's domains from its IP; whether it's sending yet
-- shows in its regular network report.
CREATE TABLE dedicated_ips (
    ip              TEXT PRIMARY KEY,
    hostname        TEXT NOT NULL UNIQUE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    assigned_at     TIMESTAMPTZ,
    note            TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dedicated_ips_organization_idx ON dedicated_ips (organization_id);
