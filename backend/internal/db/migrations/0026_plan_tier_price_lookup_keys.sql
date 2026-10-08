-- 0016 seeded the test-mode price IDs, which the live key doesn't know, so
-- every checkout in production failed with resource_missing. Plan tiers now
-- store Stripe lookup keys, set on the matching price in both test and live
-- mode, and the API resolves them per key (handlers.resolveStripePrice).
-- Only the seeded IDs are replaced; a tier changed by hand is left alone.
UPDATE plan_tiers SET stripe_price_id_monthly = 'amelu_go_monthly' WHERE id = 'go' AND stripe_price_id_monthly = 'price_1TshAPRsasihfwTqY6fQYbnh';
UPDATE plan_tiers SET stripe_price_id_annual = 'amelu_go_annual' WHERE id = 'go' AND stripe_price_id_annual = 'price_1TshAPRsasihfwTqcwxWleEU';
UPDATE plan_tiers SET stripe_price_id_monthly = 'amelu_pro_monthly' WHERE id = 'pro' AND stripe_price_id_monthly = 'price_1TshAQRsasihfwTqxppZyFfJ';
UPDATE plan_tiers SET stripe_price_id_annual = 'amelu_pro_annual' WHERE id = 'pro' AND stripe_price_id_annual = 'price_1TshARRsasihfwTqQx2ULz0t';
