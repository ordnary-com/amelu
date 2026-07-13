-- Pattern Rewrites and Bcc Captures - both purely our own metadata. The
-- actual Sieve script deployed to Stalwart is regenerated from these rows
-- on every change, not stored itself.

CREATE TABLE pattern_rewrites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id   UUID NOT NULL,
    pattern     TEXT NOT NULL,
    destination TEXT NOT NULL,
    position    INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pattern_rewrites_domain_id_idx ON pattern_rewrites(domain_id, position);

CREATE TABLE bcc_captures (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id  UUID NOT NULL,
    pattern    TEXT NOT NULL,
    capture    TEXT NOT NULL,
    position   INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bcc_captures_domain_id_idx ON bcc_captures(domain_id, position);
