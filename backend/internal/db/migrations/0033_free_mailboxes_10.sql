-- The Free plan gets 10 mailboxes per domain instead of 3.
UPDATE plan_tiers SET max_mailboxes_per_domain = 10 WHERE id = 'free';
