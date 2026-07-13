-- Sender/Recipient lists and subject handling for Spam Filtering. Each list
-- is stored as one newline-separated TEXT column (one entry per line,
-- matching Migadu's own bulk-textarea UI) rather than a Postgres array or
-- one-row-per-entry table - simplest thing that matches how these are
-- actually edited (replace the whole list, not individual add/delete).

ALTER TABLE domains ADD COLUMN spam_sender_denylist TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN spam_sender_junklist TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN spam_recipient_denylist TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN spam_subject_rewrite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE domains ADD COLUMN spam_junk_if_subject_spam BOOLEAN NOT NULL DEFAULT false;
