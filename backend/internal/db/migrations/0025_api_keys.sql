-- Personal API keys. Like sessions (0001) and organization_invitations
-- (0022), only the SHA-256 hash of the key is stored - the raw key is shown
-- to the caller once at creation and never again.
--
-- prefix is the human-readable head of the key ("amelu_live_" plus the first
-- few random characters), stored in the clear purely so the list page can
-- show which key is which. It is not enough to authenticate with.
CREATE TABLE api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    prefix       TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_customer_id_idx ON api_keys (customer_id, created_at DESC);
