-- customers.stripe_customer_id already exists (0001_init.sql) but has gone
-- unused until now; these add the rest of what a Stripe subscription needs.
ALTER TABLE customers ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE customers ADD COLUMN subscription_status TEXT; -- active, trialing, past_due, canceled, incomplete, incomplete_expired, unpaid, paused, none

CREATE INDEX customers_stripe_customer_id_idx ON customers(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX customers_stripe_subscription_id_idx ON customers(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
