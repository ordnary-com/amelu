-- Attached Notes (free-text) and Listing Settings (public directory
-- listing preference) per domain. Both are purely our own metadata - no
-- Stalwart equivalent exists for either.

ALTER TABLE domains ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN publicly_listed BOOLEAN NOT NULL DEFAULT false;
