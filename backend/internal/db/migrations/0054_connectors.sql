-- Scopes and redirect URIs are space separated text, the way OAuth writes them.
-- AI connectors (ChatGPT and other MCP clients). A connector token is not an
-- API key: it is bound to one mailbox and a short list of scopes, and it can
-- only reach the MCP endpoint, never the rest of the API. Keeping it in its
-- own table means auth.Require can never accept one by accident.
CREATE TABLE oauth_clients (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_codes (
    code_hash      TEXT PRIMARY KEY,
    client_id      TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    mailbox_id     UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    scopes         TEXT NOT NULL,
    redirect_uri   TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE connector_tokens (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    mailbox_id         UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    client_id          TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    scopes             TEXT NOT NULL,
    access_hash        TEXT NOT NULL UNIQUE,
    access_expires_at  TIMESTAMPTZ NOT NULL,
    refresh_hash       TEXT NOT NULL UNIQUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at       TIMESTAMPTZ,
    revoked_at         TIMESTAMPTZ
);

CREATE INDEX connector_tokens_customer_idx ON connector_tokens (customer_id) WHERE revoked_at IS NULL;
