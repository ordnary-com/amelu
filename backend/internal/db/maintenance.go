package db

import (
	"context"
	"database/sql"
	"errors"
)

// ClaimMaintenanceRun records name as run and reports whether this call
// did so, so of several API instances starting together only one runs it.
func (s *Store) ClaimMaintenanceRun(ctx context.Context, name string) (bool, error) {
	var claimed string
	err := s.conn.QueryRowContext(ctx, `
		INSERT INTO maintenance_runs (name) VALUES ($1)
		ON CONFLICT (name) DO NOTHING
		RETURNING name
	`, name).Scan(&claimed)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// ReleaseMaintenanceRun forgets a claimed run so the next start tries again.
func (s *Store) ReleaseMaintenanceRun(ctx context.Context, name string) error {
	_, err := s.conn.ExecContext(ctx, `DELETE FROM maintenance_runs WHERE name = $1`, name)
	return err
}

// ListDomainIDsWithForwards returns every domain that has at least one
// mailbox with a forward.
func (s *Store) ListDomainIDsWithForwards(ctx context.Context) ([]string, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT DISTINCT m.domain_id
		FROM mailbox_forwards f
		JOIN mailboxes m ON m.id = f.mailbox_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
