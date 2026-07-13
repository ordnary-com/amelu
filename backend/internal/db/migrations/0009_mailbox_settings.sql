-- Per-mailbox settings: Enabled Services (proxied to Stalwart permissions,
-- not stored here - see may_send etc. below which mirror what we last set),
-- Internal Access, Delegation, Listing Settings, Attached Notes.

ALTER TABLE mailboxes ADD COLUMN may_send BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE mailboxes ADD COLUMN may_receive BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE mailboxes ADD COLUMN may_imap BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE mailboxes ADD COLUMN may_pop3 BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE mailboxes ADD COLUMN may_sieve BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE mailboxes ADD COLUMN internal_access_only BOOLEAN NOT NULL DEFAULT false;

-- Newline-separated local parts on this same domain, like the domain-level
-- spam list columns - bulk textarea, not individual rows.
ALTER TABLE mailboxes ADD COLUMN delegation TEXT NOT NULL DEFAULT '';

ALTER TABLE mailboxes ADD COLUMN listing_tags TEXT NOT NULL DEFAULT '';
ALTER TABLE mailboxes ADD COLUMN notes TEXT NOT NULL DEFAULT '';

CREATE TABLE mailbox_forwards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id  UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    destination TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mailbox_forwards_mailbox_id_idx ON mailbox_forwards(mailbox_id);
