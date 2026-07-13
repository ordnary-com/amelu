-- Expiration: mailboxes can expire on a future date, either suspending or
-- fully deleting themselves - enforced by a scheduled job (see
-- cmd/api/main.go), not by Stalwart itself, since there's no native
-- expiration mechanism beyond the credential-expiry trick SuspendMailbox
-- already uses.
ALTER TABLE mailboxes ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE mailboxes ADD COLUMN remove_upon_expiration BOOLEAN NOT NULL DEFAULT false;

-- Limits: Stalwart's own quotas are absolute caps (total emails ever
-- stored, total disk space), not Migadu's daily-resetting counters - this
-- exposes that real capability under its own honest name rather than
-- pretending it's daily throttling. 0 here means "not configured by us" -
-- deliberately NOT sent to Stalwart at all in that case (its own meaning
-- for a literal 0 quota isn't confirmed, so this side just omits the key
-- rather than guessing).
ALTER TABLE mailboxes ADD COLUMN max_emails BIGINT NOT NULL DEFAULT 0;
ALTER TABLE mailboxes ADD COLUMN max_disk_quota_bytes BIGINT NOT NULL DEFAULT 0;
