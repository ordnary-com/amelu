-- Every customer belongs to an organization, created automatically at
-- signup (mirrors the account/org split customers will recognize from
-- other mail-hosting admin panels).

CREATE TABLE organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customers ADD COLUMN organization_id UUID REFERENCES organizations(id);
