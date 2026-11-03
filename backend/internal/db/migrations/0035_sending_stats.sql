-- How many messages each sender domain sent over the last 24 hours, counted
-- from Stalwart's log on marduk (ops/marduk/amelu-sending-stats.py) and
-- reported to POST /internal/jobs/sending-stats. Each report replaces the
-- table; domains that sent nothing have no row. The dashboard shows it
-- against the plan's max_outgoing_per_day.
CREATE TABLE sending_stats (
    domain_name TEXT PRIMARY KEY,
    sent_24h INT NOT NULL
);

-- When the last report came in, so the dashboard can tell "sent nothing"
-- from "no data".
CREATE TABLE sending_stats_report (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    reported_at TIMESTAMPTZ NOT NULL
);
