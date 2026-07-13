-- Tracks which of a plan's two prices (price_cents_monthly vs
-- price_cents_annual) the customer's active subscription actually uses -
-- without this there's no way to know whether to display the monthly rate
-- or the annual-equivalent rate on the billing overview page.
ALTER TABLE customers ADD COLUMN billing_interval TEXT; -- monthly, annual
