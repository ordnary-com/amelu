package db

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// ReplaceSendingStats stores a sending report: messages per sender domain
// over the last 24 hours, replacing the previous report entirely.
func (s *Store) ReplaceSendingStats(ctx context.Context, sent map[string]int, at time.Time) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM sending_stats`); err != nil {
		return err
	}
	for domain, n := range sent {
		if _, err := tx.ExecContext(ctx, `INSERT INTO sending_stats (domain_name, sent_24h) VALUES ($1, $2)
			ON CONFLICT (domain_name) DO UPDATE SET sent_24h = sending_stats.sent_24h + EXCLUDED.sent_24h`,
			strings.ToLower(domain), n); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO sending_stats_report (id, reported_at) VALUES (TRUE, $1)
		ON CONFLICT (id) DO UPDATE SET reported_at = EXCLUDED.reported_at`, at); err != nil {
		return err
	}
	return tx.Commit()
}

// GetSendingStat returns how many messages a sender domain sent over the
// last 24 hours as of the last report, and when that report came in. A zero
// reportedAt means no report has come in yet.
func (s *Store) GetSendingStat(ctx context.Context, domainName string) (sent int, reportedAt time.Time, err error) {
	err = s.conn.QueryRowContext(ctx, `SELECT reported_at FROM sending_stats_report WHERE id`).Scan(&reportedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, time.Time{}, nil
	} else if err != nil {
		return 0, time.Time{}, err
	}
	err = s.conn.QueryRowContext(ctx, `SELECT sent_24h FROM sending_stats WHERE domain_name = $1`, strings.ToLower(domainName)).Scan(&sent)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, reportedAt, nil
	}
	return sent, reportedAt, err
}

// GetOutgoingLimit returns a plan tier's max_outgoing_per_day.
func (s *Store) GetOutgoingLimit(ctx context.Context, planTierID string) (int, error) {
	var n int
	err := s.conn.QueryRowContext(ctx, `SELECT max_outgoing_per_day FROM plan_tiers WHERE id = $1`, planTierID).Scan(&n)
	return n, err
}
