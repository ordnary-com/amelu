-- "Calendar and contacts" (CalDAV and CardDAV) as an Enabled Services
-- toggle, per mailbox and as the domain's default for new mailboxes. Stalwart
-- allows it for every user already, so existing mailboxes start enabled.
ALTER TABLE mailboxes ADD COLUMN may_dav BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE domains ADD COLUMN default_may_dav BOOLEAN NOT NULL DEFAULT TRUE;
