-- First-login onboarding (devlog 2026-11-07-onboarding.txt). onboarded_at is
-- set for everyone who already has an account, so only new accounts see it.
ALTER TABLE customers ADD COLUMN onboarded_at TIMESTAMPTZ;
UPDATE customers SET onboarded_at = created_at;

CREATE TABLE onboarding_answers (
    customer_id     UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    use_case        TEXT NOT NULL DEFAULT '',
    team_size       TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT '',
    source_detail   TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_answers_source_idx ON onboarding_answers (source);
