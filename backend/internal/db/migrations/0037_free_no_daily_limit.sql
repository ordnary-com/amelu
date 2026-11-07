-- The free plan has no daily cap on outgoing mail (0 means none): the hourly
-- per-domain throttle and the sender guard cover abuse. See devlog
-- 2026-11-07-free-no-daily-limit.txt.
UPDATE plan_tiers SET max_outgoing_per_day = 0 WHERE id = 'free';
