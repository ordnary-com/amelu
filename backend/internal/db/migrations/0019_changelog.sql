-- Internal changelog, managed from Helm (ordnary-identity/apps/helm) via the
-- cross-customer admin API. published_at NULL means draft (not yet visible
-- anywhere public - there's no public changelog page yet, this is storage
-- + admin CRUD only for now).
CREATE TABLE changelog_entries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    author       TEXT NOT NULL,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX changelog_entries_published_at_idx ON changelog_entries (published_at DESC NULLS LAST);
