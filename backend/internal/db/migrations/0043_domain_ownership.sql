-- Domain ownership verification (devlog 2026-11-09-domain-ownership.txt).
-- Stalwart treats every domain it hosts as local and stops following MX for
-- it, so a domain may only reach Stalwart once a TXT record at
-- _amelu.<domain> proves the customer controls its DNS. Until then it only
-- exists here, as status 'unverified'.
ALTER TABLE domains ADD COLUMN verification_token TEXT;
ALTER TABLE domains ADD COLUMN ownership_verified_at TIMESTAMPTZ;
-- "Use Amelu nameservers" was picked when adding: applied once ownership is proven.
ALTER TABLE domains ADD COLUMN wants_amelu_dns BOOLEAN NOT NULL DEFAULT false;

-- hotmail.com was added by a customer on 2026-11-05, which made every Amelu
-- sender bounce on mail to @hotmail.com. It was removed from Stalwart by hand
-- on 2026-11-09; this drops the leftover row (mailbox rows cascade).
DELETE FROM domains WHERE lower(name) = 'hotmail.com';

-- Everything else already exists in Stalwart, so it counts as verified. The
-- token is still needed for adding domain aliases, which prove themselves with it.
UPDATE domains SET ownership_verified_at = created_at;
UPDATE domains SET verification_token = replace(gen_random_uuid()::text, '-', '');
ALTER TABLE domains ALTER COLUMN verification_token SET NOT NULL;

-- An unverified claim must not block the real owner: names only have to be
-- unique among verified domains (first to verify wins), and once per customer.
ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_name_key;
CREATE UNIQUE INDEX domains_verified_name_key ON domains (lower(name)) WHERE ownership_verified_at IS NOT NULL;
CREATE UNIQUE INDEX domains_customer_name_key ON domains (customer_id, lower(name));
