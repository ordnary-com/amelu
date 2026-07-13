-- Per-domain activity log, powering the "Recent Activity" page. Kept as a
-- plain UUID reference (no foreign key) rather than cascading on domain
-- deletion, since the domain's own activity page becomes unreachable once
-- the domain is gone anyway - there's no reason to force the log rows to
-- disappear in lockstep.

CREATE TABLE activity_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id  UUID NOT NULL,
    event_type TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_log_domain_id_idx ON activity_log(domain_id, created_at DESC);
