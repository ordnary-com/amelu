-- Organization invitations. Mirrors password_reset_tokens (0011): only the
-- SHA-256 hash of the invite token is ever stored, the raw token is emailed
-- (or, when Resend isn't configured, handed back to the caller in dev - see
-- internal/handlers/organization_invitations.go) and never persisted.
CREATE TABLE organization_invitations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email                 TEXT NOT NULL,
    role                  TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'helpdesk', 'billing', 'read_only')),
    token_hash            TEXT NOT NULL UNIQUE,
    invited_by_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    expires_at            TIMESTAMPTZ NOT NULL,
    accepted_at           TIMESTAMPTZ,
    revoked_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX organization_invitations_organization_id_idx ON organization_invitations (organization_id, created_at DESC);

-- Case-insensitive uniqueness per organization, but only while an
-- invitation is still open - a revoked/accepted/expired invite must not
-- block re-inviting the same address later.
CREATE UNIQUE INDEX organization_invitations_open_email_idx
    ON organization_invitations (organization_id, lower(email))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
