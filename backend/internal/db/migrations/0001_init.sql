-- SaaS-level metadata store for Amelu. Kept separate from Stalwart's own
-- amelu_mail Postgres database, which stores mail data itself.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE plan_tiers (
    id                       TEXT PRIMARY KEY,
    name                     TEXT NOT NULL,
    max_domains              INT NOT NULL,
    max_mailboxes_per_domain INT NOT NULL,
    -- Billing is out of scope for this pass; these columns are placeholders
    -- so a future billing integration can slot in without a schema change.
    price_cents              INT,
    billing_provider         TEXT,
    billing_plan_id          TEXT
);

INSERT INTO plan_tiers (id, name, max_domains, max_mailboxes_per_domain, price_cents, billing_provider, billing_plan_id)
VALUES ('free', 'Free', 1, 3, NULL, NULL, NULL);

CREATE TABLE customers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email              TEXT NOT NULL UNIQUE,
    password_hash      TEXT NOT NULL,
    plan_tier_id       TEXT NOT NULL REFERENCES plan_tiers(id) DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_customer_id_idx ON sessions(customer_id);

CREATE TABLE domains (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'provisioning', -- provisioning, dns_pending, active, failed, suspended
    dkim_selector   TEXT,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at     TIMESTAMPTZ
);

CREATE INDEX domains_customer_id_idx ON domains(customer_id);

CREATE TABLE mailboxes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id   UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    local_part  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active', -- active, suspended, deleted
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (domain_id, local_part)
);

CREATE INDEX mailboxes_domain_id_idx ON mailboxes(domain_id);
