-- Generic audit trail for admin actions that don't have a single domain to
-- attach to (activity_log is domain_id-scoped only - see 0005). Covers
-- customer/organization/subscription/changelog admin actions.
CREATE TABLE admin_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    operator    TEXT NOT NULL,
    action      TEXT NOT NULL,
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_entity_idx ON admin_audit_log (entity_type, entity_id, created_at DESC);
