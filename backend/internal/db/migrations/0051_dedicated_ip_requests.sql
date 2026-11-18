-- Dedicated IP requests: a support ticket of its own kind (category
-- dedicated_ip) with the customer's answers and where the request stands.
-- System messages (author_kind system) mark each step in the conversation:
-- received, approved or declined, paid, assigned, ended.
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_category_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_category_check
    CHECK (category IN ('account', 'domains', 'delivery', 'billing', 'other', 'dedicated_ip'));

ALTER TABLE support_messages DROP CONSTRAINT support_messages_author_kind_check;
ALTER TABLE support_messages ADD CONSTRAINT support_messages_author_kind_check
    CHECK (author_kind IN ('customer', 'staff', 'system'));

CREATE TABLE dedicated_ip_requests (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id              UUID NOT NULL UNIQUE REFERENCES support_tickets(id) ON DELETE CASCADE,
    organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requested_by           UUID REFERENCES customers(id) ON DELETE SET NULL,
    volume                 TEXT NOT NULL,
    use_case               TEXT NOT NULL,
    domains                TEXT NOT NULL DEFAULT '',
    -- requested -> approved -> paid -> active; declined or cancelled end it.
    status                 TEXT NOT NULL DEFAULT 'requested'
                           CHECK (status IN ('requested', 'approved', 'declined', 'paid', 'active', 'cancelled')),
    stripe_subscription_id TEXT,
    ip                     TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dedicated_ip_requests_organization_idx ON dedicated_ip_requests (organization_id);
