-- Bumped up significantly - Amelu positions Go/Pro as generous, cheap-provider
-- tiers rather than tightly metered ones.
UPDATE plan_tiers SET max_domains = 25, max_mailboxes_per_domain = 200 WHERE id = 'go';
UPDATE plan_tiers SET max_domains = 100, max_mailboxes_per_domain = 1000 WHERE id = 'pro';
