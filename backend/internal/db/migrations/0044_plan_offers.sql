-- Custom plans (devlog 2026-11-11-custom-plan-offers.txt). Support makes a
-- plan for one organization in Airplane; it is a real plan tier with its own
-- Stripe price, hidden from everyone else's plan list. The organization gets
-- a link to an offer, accepting it goes through Stripe Checkout like any
-- other plan, so renewals and invoices run on their own from then on.
ALTER TABLE plan_tiers ADD COLUMN custom BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE plan_offers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_tier_id    TEXT NOT NULL REFERENCES plan_tiers(id),
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX plan_offers_organization_id ON plan_offers (organization_id);
