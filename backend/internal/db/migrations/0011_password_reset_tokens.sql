-- Password reset invite links. The raw token is only ever emailed to the
-- recipient - never stored - matching how session tokens are handled
-- (see internal/auth): only its SHA-256 hash lives here.
CREATE TABLE password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);
CREATE INDEX password_reset_tokens_mailbox_id_idx ON password_reset_tokens(mailbox_id);
