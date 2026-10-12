-- The Ordnary profile picture (OIDC "picture"), refreshed on every Ordnary
-- login so the dashboard can show the same avatar as the rest of Ordnary.
ALTER TABLE customers ADD COLUMN avatar_url TEXT;
