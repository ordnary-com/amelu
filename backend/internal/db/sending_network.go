package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// SendingIPStatus is one outbound IP as amelu-ip-pools on marduk sees it.
type SendingIPStatus struct {
	Name  string `json:"name"`
	IP    string `json:"ip"`
	Group string `json:"group"`
	// active, paused, pending or spare.
	State string `json:"state"`
}

// ReplaceSendingNetwork stores the latest per-IP status report.
func (s *Store) ReplaceSendingNetwork(ctx context.Context, ips []SendingIPStatus, at time.Time) error {
	raw, err := json.Marshal(ips)
	if err != nil {
		return err
	}
	_, err = s.conn.ExecContext(ctx, `INSERT INTO sending_network (id, ips, reported_at) VALUES (TRUE, $1, $2)
		ON CONFLICT (id) DO UPDATE SET ips = EXCLUDED.ips, reported_at = EXCLUDED.reported_at`, raw, at)
	return err
}

// GetSendingNetwork returns the latest report; a zero time means none came in yet.
func (s *Store) GetSendingNetwork(ctx context.Context) ([]SendingIPStatus, time.Time, error) {
	var raw []byte
	var at time.Time
	err := s.conn.QueryRowContext(ctx, `SELECT ips, reported_at FROM sending_network WHERE id`).Scan(&raw, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, time.Time{}, nil
	}
	if err != nil {
		return nil, time.Time{}, err
	}
	var ips []SendingIPStatus
	if err := json.Unmarshal(raw, &ips); err != nil {
		return nil, time.Time{}, err
	}
	return ips, at, nil
}
