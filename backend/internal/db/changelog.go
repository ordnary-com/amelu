package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type ChangelogEntry struct {
	ID          string
	Title       string
	Body        string
	Author      string
	PublishedAt sql.NullTime
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

const changelogColumns = `id, title, body, author, published_at, created_at, updated_at`

func scanChangelogEntry(row interface {
	Scan(dest ...any) error
}) (*ChangelogEntry, error) {
	e := &ChangelogEntry{}
	err := row.Scan(&e.ID, &e.Title, &e.Body, &e.Author, &e.PublishedAt, &e.CreatedAt, &e.UpdatedAt)
	return e, err
}

// ListChangelogEntries returns every entry (draft and published), newest
// first - this is only ever called from the admin surface, which needs to
// see drafts too.
func (s *Store) ListChangelogEntries(ctx context.Context) ([]ChangelogEntry, error) {
	rows, err := s.conn.QueryContext(ctx, `SELECT `+changelogColumns+` FROM changelog_entries ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ChangelogEntry
	for rows.Next() {
		e, err := scanChangelogEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func (s *Store) CreateChangelogEntry(ctx context.Context, title, body, author string) (*ChangelogEntry, error) {
	row := s.conn.QueryRowContext(ctx, `
		INSERT INTO changelog_entries (title, body, author)
		VALUES ($1, $2, $3)
		RETURNING `+changelogColumns, title, body, author)
	return scanChangelogEntry(row)
}

type UpdateChangelogEntryInput struct {
	Title     *string
	Body      *string
	Published *bool
}

func (s *Store) UpdateChangelogEntry(ctx context.Context, id string, in UpdateChangelogEntryInput) (*ChangelogEntry, error) {
	if in.Title != nil {
		if _, err := s.conn.ExecContext(ctx, `UPDATE changelog_entries SET title = $1, updated_at = now() WHERE id = $2`, *in.Title, id); err != nil {
			return nil, err
		}
	}
	if in.Body != nil {
		if _, err := s.conn.ExecContext(ctx, `UPDATE changelog_entries SET body = $1, updated_at = now() WHERE id = $2`, *in.Body, id); err != nil {
			return nil, err
		}
	}
	if in.Published != nil {
		if *in.Published {
			if _, err := s.conn.ExecContext(ctx, `UPDATE changelog_entries SET published_at = COALESCE(published_at, now()), updated_at = now() WHERE id = $1`, id); err != nil {
				return nil, err
			}
		} else {
			if _, err := s.conn.ExecContext(ctx, `UPDATE changelog_entries SET published_at = NULL, updated_at = now() WHERE id = $1`, id); err != nil {
				return nil, err
			}
		}
	}
	row := s.conn.QueryRowContext(ctx, `SELECT `+changelogColumns+` FROM changelog_entries WHERE id = $1`, id)
	e, err := scanChangelogEntry(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (s *Store) DeleteChangelogEntry(ctx context.Context, id string) error {
	res, err := s.conn.ExecContext(ctx, `DELETE FROM changelog_entries WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
