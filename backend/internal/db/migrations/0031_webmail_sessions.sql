-- Sessions for webmail.amelu.org: a mailbox user signed in with the mailbox
-- password, independent of the dashboard's customer sessions. The Stalwart
-- account id is kept so every call can address the account without
-- resolving it again. See docs/WEBMAIL.md.
CREATE TABLE webmail_sessions (
    token_hash          TEXT PRIMARY KEY,
    mailbox_id          UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    stalwart_account_id TEXT NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webmail_sessions_mailbox_id_idx ON webmail_sessions(mailbox_id);
