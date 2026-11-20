-- A connector grant covers a set of targets instead of exactly one mailbox:
-- the whole organization, whole domains (including mailboxes created later) or
-- individual mailboxes. Stored space separated as "kind:id", the way scopes are.
ALTER TABLE oauth_codes ADD COLUMN targets TEXT NOT NULL DEFAULT '';
ALTER TABLE connector_tokens ADD COLUMN targets TEXT NOT NULL DEFAULT '';

UPDATE oauth_codes SET targets = 'mailbox:' || mailbox_id;
UPDATE connector_tokens SET targets = 'mailbox:' || mailbox_id;

ALTER TABLE oauth_codes DROP COLUMN mailbox_id;
ALTER TABLE connector_tokens DROP COLUMN mailbox_id;
