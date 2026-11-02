-- Outgoing mail per sender domain per day, enforced as Stalwart outbound
-- throttles that the API keeps in sync with each organization's plan
-- (handlers/sending_limits.go). Over the limit, mail waits in the queue.
ALTER TABLE plan_tiers ADD COLUMN max_outgoing_per_day INT NOT NULL DEFAULT 150;
UPDATE plan_tiers SET max_outgoing_per_day = 1000 WHERE id = 'go';
UPDATE plan_tiers SET max_outgoing_per_day = 3000 WHERE id = 'pro';
