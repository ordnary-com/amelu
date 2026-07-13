package db

import (
	"context"
	"time"
)

type PatternRewrite struct {
	ID          string
	DomainID    string
	Pattern     string
	Destination string
	Position    int
	CreatedAt   time.Time
}

type BccCapture struct {
	ID        string
	DomainID  string
	Pattern   string
	Capture   string
	Position  int
	CreatedAt time.Time
}

func (s *Store) ListPatternRewrites(ctx context.Context, domainID string) ([]PatternRewrite, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT id, domain_id, pattern, destination, position, created_at
		FROM pattern_rewrites WHERE domain_id = $1 ORDER BY position
	`, domainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PatternRewrite
	for rows.Next() {
		var r PatternRewrite
		if err := rows.Scan(&r.ID, &r.DomainID, &r.Pattern, &r.Destination, &r.Position, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) CreatePatternRewrite(ctx context.Context, domainID, pattern, destination string) (*PatternRewrite, error) {
	r := &PatternRewrite{}
	err := s.conn.QueryRowContext(ctx, `
		INSERT INTO pattern_rewrites (domain_id, pattern, destination, position)
		VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), -1) + 1 FROM pattern_rewrites WHERE domain_id = $1))
		RETURNING id, domain_id, pattern, destination, position, created_at
	`, domainID, pattern, destination).Scan(&r.ID, &r.DomainID, &r.Pattern, &r.Destination, &r.Position, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (s *Store) DeletePatternRewrite(ctx context.Context, domainID, id string) error {
	res, err := s.conn.ExecContext(ctx, `DELETE FROM pattern_rewrites WHERE id = $1 AND domain_id = $2`, id, domainID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListBccCaptures(ctx context.Context, domainID string) ([]BccCapture, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT id, domain_id, pattern, capture, position, created_at
		FROM bcc_captures WHERE domain_id = $1 ORDER BY position
	`, domainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BccCapture
	for rows.Next() {
		var c BccCapture
		if err := rows.Scan(&c.ID, &c.DomainID, &c.Pattern, &c.Capture, &c.Position, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) CreateBccCapture(ctx context.Context, domainID, pattern, capture string) (*BccCapture, error) {
	c := &BccCapture{}
	err := s.conn.QueryRowContext(ctx, `
		INSERT INTO bcc_captures (domain_id, pattern, capture, position)
		VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), -1) + 1 FROM bcc_captures WHERE domain_id = $1))
		RETURNING id, domain_id, pattern, capture, position, created_at
	`, domainID, pattern, capture).Scan(&c.ID, &c.DomainID, &c.Pattern, &c.Capture, &c.Position, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Store) DeleteBccCapture(ctx context.Context, domainID, id string) error {
	res, err := s.conn.ExecContext(ctx, `DELETE FROM bcc_captures WHERE id = $1 AND domain_id = $2`, id, domainID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
