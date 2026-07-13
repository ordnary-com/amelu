-- Display name per mailbox, shown on the Mailboxes list and its Manage page
-- (mirrors "Name" in other mail-hosting admin panels).

ALTER TABLE mailboxes ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
