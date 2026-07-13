ALTER TABLE customers
    ADD COLUMN first_name TEXT,
    ADD COLUMN last_name  TEXT,
    ADD COLUMN username   TEXT;

-- Partial unique index so multiple customers can still have a NULL username
-- (accounts created before this migration, until they set one).
CREATE UNIQUE INDEX customers_username_idx ON customers (username) WHERE username IS NOT NULL;
