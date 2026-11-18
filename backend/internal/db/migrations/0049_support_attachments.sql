-- Files sent with a support message. Kept in the database: they're small
-- (the API caps them at 10 MB each, 20 MB per message) and go away with
-- their ticket.
CREATE TABLE support_attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    message_id   UUID NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size         INTEGER NOT NULL,
    data         BYTEA NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_attachments_ticket_idx ON support_attachments (ticket_id);
