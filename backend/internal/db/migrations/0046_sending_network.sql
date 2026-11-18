-- Per sending IP: its group and whether it sends, as last reported by
-- ops/marduk/amelu-ip-pools.py through amelu-sending-stats.py. One row,
-- replaced by every report; the dashboard's Sending IPs page reads it.
CREATE TABLE IF NOT EXISTS sending_network (
    id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    ips         JSONB NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL
);
