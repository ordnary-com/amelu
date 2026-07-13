-- Fields needed for the My Account pages: display name, and last sign-in
-- tracking (updated on every successful login).

ALTER TABLE customers ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN last_sign_in_at TIMESTAMPTZ;
