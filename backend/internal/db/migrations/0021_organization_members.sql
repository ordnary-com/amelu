-- Teams, invitations and roles: every organization has zero or more
-- members, each with exactly one role. Today every organization has exactly
-- one customer (see 0002_organizations.sql), so we backfill that customer
-- as 'owner' - the migration this file performs is safe and non-destructive
-- for every existing organization.
CREATE TABLE organization_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'helpdesk', 'billing', 'read_only')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX organization_members_organization_id_idx ON organization_members (organization_id);

-- A customer only ever belongs to the one organization referenced by
-- customers.organization_id (Amelu has no cross-organization membership),
-- so customer_id is UNIQUE above rather than the pair being the key.

INSERT INTO organization_members (organization_id, customer_id, role)
SELECT organization_id, id, 'owner' FROM customers WHERE organization_id IS NOT NULL;
