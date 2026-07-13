-- Every paid plan bills annually by default with a cheaper effective rate,
-- and monthly at a premium - so each plan tier needs two prices, not one.
ALTER TABLE plan_tiers DROP COLUMN price_cents;
ALTER TABLE plan_tiers DROP COLUMN billing_plan_id;

ALTER TABLE plan_tiers ADD COLUMN price_cents_monthly INT;
ALTER TABLE plan_tiers ADD COLUMN price_cents_annual INT;
ALTER TABLE plan_tiers ADD COLUMN stripe_price_id_monthly TEXT;
ALTER TABLE plan_tiers ADD COLUMN stripe_price_id_annual TEXT;

INSERT INTO plan_tiers (id, name, max_domains, max_mailboxes_per_domain, billing_provider, price_cents_monthly, price_cents_annual, stripe_price_id_monthly, stripe_price_id_annual)
VALUES
    ('go', 'Go', 10, 50, 'stripe', 600, 4800, 'price_1TshAPRsasihfwTqY6fQYbnh', 'price_1TshAPRsasihfwTqcwxWleEU'),
    ('pro', 'Pro', 50, 500, 'stripe', 1400, 10800, 'price_1TshAQRsasihfwTqxppZyFfJ', 'price_1TshARRsasihfwTqQx2ULz0t');
