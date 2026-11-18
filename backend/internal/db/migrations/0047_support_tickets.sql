-- Support tickets in the dashboard instead of email. A ticket belongs to an
-- organization (every member sees it); support answers from Airplane's Amelu
-- section through the /internal/admin/support routes. Status says whose turn
-- it is: open = waiting on Amelu, answered = waiting on the customer, closed.
CREATE TABLE support_tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number          BIGSERIAL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    opened_by       UUID REFERENCES customers(id) ON DELETE SET NULL,
    subject         TEXT NOT NULL,
    category        TEXT NOT NULL CHECK (category IN ('account', 'domains', 'delivery', 'billing', 'other')),
    domain_id       UUID REFERENCES domains(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
    priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    assigned_to     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at       TIMESTAMPTZ
);

CREATE INDEX support_tickets_organization ON support_tickets (organization_id, updated_at DESC);
CREATE INDEX support_tickets_status ON support_tickets (status, updated_at DESC);

-- internal messages are staff notes; customers never see them.
CREATE TABLE support_messages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id          UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_kind        TEXT NOT NULL CHECK (author_kind IN ('customer', 'staff')),
    author_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    author_name        TEXT NOT NULL,
    body               TEXT NOT NULL,
    internal           BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_messages_ticket ON support_messages (ticket_id, created_at);
