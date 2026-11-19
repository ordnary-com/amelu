-- Actions taken against a domain that its customer should be able to see on
-- the dashboard's Domain status page: send pauses by marduk's sender guard
-- (ops/marduk/amelu-sender-guard.py, reported through POST
-- /internal/jobs/domain-actions) and notices from staff. lifted_at stays NULL
-- while the action is in force. The pause itself lives in Stalwart (emailSend
-- disabled per account); this is its history, not the switch.
CREATE TABLE domain_actions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id  UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('sending_paused', 'notice')),
    reason     TEXT NOT NULL DEFAULT '',
    source     TEXT NOT NULL CHECK (source IN ('sender_guard', 'staff')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lifted_at  TIMESTAMPTZ,
    lifted_by  TEXT
);

CREATE INDEX domain_actions_domain_idx ON domain_actions (domain_id, created_at DESC);

-- One open action per kind: the guard reporting the same pause twice (a retry)
-- must not add a second row.
CREATE UNIQUE INDEX domain_actions_open_idx ON domain_actions (domain_id, kind) WHERE lifted_at IS NULL;
