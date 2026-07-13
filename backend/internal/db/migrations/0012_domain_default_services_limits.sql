-- Domain-wide defaults applied to a mailbox at creation time only (mirrors
-- the per-mailbox may_send/etc. and max_emails/etc. columns from
-- 0009/0010). Changing these has no effect on already-created mailboxes.

ALTER TABLE domains ADD COLUMN default_may_send BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE domains ADD COLUMN default_may_receive BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE domains ADD COLUMN default_may_imap BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE domains ADD COLUMN default_may_pop3 BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE domains ADD COLUMN default_may_sieve BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE domains ADD COLUMN default_max_emails BIGINT NOT NULL DEFAULT 0;
ALTER TABLE domains ADD COLUMN default_max_disk_quota_bytes BIGINT NOT NULL DEFAULT 0;
