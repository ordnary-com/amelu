package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// MailboxFilter is one "if ... then ..." rule on a mailbox. Field is from,
// to or subject; Match is contains, is or starts; Action is move, forward,
// read, flag or delete, with Target the folder or address for move and
// forward. Stop means later filters don't run for a matching message.
type MailboxFilter struct {
	ID        string
	MailboxID string
	Position  int
	Field     string
	Match     string
	Value     string
	Action    string
	Target    string
	Stop      bool
	CreatedAt time.Time
}

const filterColumns = `id, mailbox_id, position, field, match, value, action, target, stop, created_at`

func scanFilter(row interface{ Scan(...any) error }) (*MailboxFilter, error) {
	var f MailboxFilter
	if err := row.Scan(&f.ID, &f.MailboxID, &f.Position, &f.Field, &f.Match, &f.Value, &f.Action, &f.Target, &f.Stop, &f.CreatedAt); err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *Store) ListMailboxFilters(ctx context.Context, mailboxID string) ([]MailboxFilter, error) {
	rows, err := s.conn.QueryContext(ctx, `SELECT `+filterColumns+` FROM mailbox_filters WHERE mailbox_id = $1 ORDER BY position, created_at`, mailboxID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MailboxFilter
	for rows.Next() {
		f, err := scanFilter(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *f)
	}
	return out, rows.Err()
}

// CreateMailboxFilter appends the filter after the mailbox's existing ones.
func (s *Store) CreateMailboxFilter(ctx context.Context, f MailboxFilter) (*MailboxFilter, error) {
	row := s.conn.QueryRowContext(ctx, `
		INSERT INTO mailbox_filters (mailbox_id, position, field, match, value, action, target, stop)
		VALUES ($1, COALESCE((SELECT MAX(position) + 1 FROM mailbox_filters WHERE mailbox_id = $1), 0), $2, $3, $4, $5, $6, $7)
		RETURNING `+filterColumns, f.MailboxID, f.Field, f.Match, f.Value, f.Action, f.Target, f.Stop)
	return scanFilter(row)
}

func (s *Store) UpdateMailboxFilter(ctx context.Context, f MailboxFilter) (*MailboxFilter, error) {
	row := s.conn.QueryRowContext(ctx, `
		UPDATE mailbox_filters SET field = $3, match = $4, value = $5, action = $6, target = $7, stop = $8
		WHERE mailbox_id = $1 AND id = $2
		RETURNING `+filterColumns, f.MailboxID, f.ID, f.Field, f.Match, f.Value, f.Action, f.Target, f.Stop)
	out, err := scanFilter(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return out, err
}

func (s *Store) DeleteMailboxFilter(ctx context.Context, mailboxID, id string) error {
	res, err := s.conn.ExecContext(ctx, `DELETE FROM mailbox_filters WHERE mailbox_id = $1 AND id = $2`, mailboxID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ReorderMailboxFilters sets each listed filter's position to its index.
func (s *Store) ReorderMailboxFilters(ctx context.Context, mailboxID string, ids []string) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, id := range ids {
		if _, err := tx.ExecContext(ctx, `UPDATE mailbox_filters SET position = $3 WHERE mailbox_id = $1 AND id = $2`, mailboxID, id, i); err != nil {
			return err
		}
	}
	return tx.Commit()
}
