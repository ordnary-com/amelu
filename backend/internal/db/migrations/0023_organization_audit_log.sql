-- Append-only audit trail for team/role/invitation/domain/mailbox/billing
-- actions within an organization - distinct from admin_audit_log (0020,
-- Helm's cross-customer admin surface) and activity_log (0005, domain-scoped
-- provisioning events). Surfaced as "Recent activity" on MyOrganizationPage.
CREATE TABLE organization_audit_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    actor_email       TEXT NOT NULL,
    action            TEXT NOT NULL,
    object_type       TEXT NOT NULL,
    object_id         TEXT,
    object_label      TEXT,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_ip        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX organization_audit_log_org_created_idx ON organization_audit_log (organization_id, created_at DESC);

-- No UPDATE/DELETE grants are revoked here (Amelu doesn't manage DB roles
-- per-table), but every write path in internal/db/organization_audit.go is
-- an INSERT only - callers must never update or delete rows in this table.
