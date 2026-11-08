-- Mail filters a customer builds in the dashboard ("if the sender contains
-- x, move it to folder y"), compiled into the mailbox's Sieve script by
-- internal/sieve/filters.go. Applied in position order.
CREATE TABLE mailbox_filters (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    position   INT NOT NULL DEFAULT 0,
    field      TEXT NOT NULL,
    match      TEXT NOT NULL,
    value      TEXT NOT NULL,
    action     TEXT NOT NULL,
    target     TEXT NOT NULL DEFAULT '',
    stop       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mailbox_filters_mailbox_idx ON mailbox_filters (mailbox_id, position);
