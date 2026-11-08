-- 14 days of sending results per sender domain and per sender address, from
-- ops/marduk/amelu-sending-stats.py, for the dashboard's delivery charts.
-- Only non-zero days are stored; each report replaces the days it covers.
CREATE TABLE sending_history (
    domain_name TEXT NOT NULL,
    day         DATE NOT NULL,
    sent        INT NOT NULL DEFAULT 0,
    delivered   INT NOT NULL DEFAULT 0,
    deferred    INT NOT NULL DEFAULT 0,
    rejected    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (domain_name, day)
);

CREATE TABLE sending_history_senders (
    address TEXT NOT NULL,
    day     DATE NOT NULL,
    sent    INT NOT NULL,
    PRIMARY KEY (address, day)
);

-- The most common rejection reasons of the last 7 days, per domain.
CREATE TABLE sending_reasons (
    domain_name TEXT NOT NULL,
    position    INT NOT NULL,
    reason      TEXT NOT NULL,
    count       INT NOT NULL,
    PRIMARY KEY (domain_name, position)
);
