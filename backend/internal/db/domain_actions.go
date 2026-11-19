package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// DomainAction is one entry in a domain's action history (migration 0052).
type DomainAction struct {
	ID        string
	DomainID  string
	Kind      string
	Reason    string
	Source    string
	CreatedAt time.Time
	LiftedAt  sql.NullTime
	LiftedBy  sql.NullString
}

const domainActionColumns = `id, domain_id, kind, reason, source, created_at, lifted_at, lifted_by`

func scanDomainAction(row interface{ Scan(...any) error }) (*DomainAction, error) {
	var a DomainAction
	err := row.Scan(&a.ID, &a.DomainID, &a.Kind, &a.Reason, &a.Source, &a.CreatedAt, &a.LiftedAt, &a.LiftedBy)
	return &a, err
}

// GetVerifiedDomainIDByName finds the domain marduk knows by this name: only
// a verified domain exists in Stalwart, and only one may hold a name.
func (s *Store) GetVerifiedDomainIDByName(ctx context.Context, name string) (string, error) {
	var id string
	err := s.conn.QueryRowContext(ctx,
		`SELECT id FROM domains WHERE lower(name) = lower($1) AND ownership_verified_at IS NOT NULL`, name).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

// RecordDomainAction opens an action, unless one of the same kind is already
// open for the domain; created says which.
func (s *Store) RecordDomainAction(ctx context.Context, domainID, kind, reason, source string, at time.Time) (created bool, err error) {
	res, err := s.conn.ExecContext(ctx, `
		INSERT INTO domain_actions (domain_id, kind, reason, source, created_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (domain_id, kind) WHERE lifted_at IS NULL DO NOTHING`,
		domainID, kind, reason, source, at)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// LiftDomainAction marks the domain's open action of this kind lifted;
// lifted is false when none was open.
func (s *Store) LiftDomainAction(ctx context.Context, domainID, kind, by string, at time.Time) (lifted bool, err error) {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE domain_actions SET lifted_at = $3, lifted_by = $4
		WHERE domain_id = $1 AND kind = $2 AND lifted_at IS NULL`,
		domainID, kind, at, by)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// OpenDomainAction returns the domain's open action of this kind, or ErrNotFound.
func (s *Store) OpenDomainAction(ctx context.Context, domainID, kind string) (*DomainAction, error) {
	a, err := scanDomainAction(s.conn.QueryRowContext(ctx,
		`SELECT `+domainActionColumns+` FROM domain_actions WHERE domain_id = $1 AND kind = $2 AND lifted_at IS NULL`,
		domainID, kind))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return a, nil
}

// ListDomainActions returns the domain's most recent actions, newest first.
func (s *Store) ListDomainActions(ctx context.Context, domainID string, limit int) ([]DomainAction, error) {
	rows, err := s.conn.QueryContext(ctx,
		`SELECT `+domainActionColumns+` FROM domain_actions WHERE domain_id = $1 ORDER BY created_at DESC LIMIT $2`,
		domainID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DomainAction
	for rows.Next() {
		a, err := scanDomainAction(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

// CustomerSuspended reports whether staff suspended the customer (migration
// 0045). The reason stays internal.
func (s *Store) CustomerSuspended(ctx context.Context, customerID string) (bool, error) {
	var suspended bool
	err := s.conn.QueryRowContext(ctx, `SELECT suspended_at IS NOT NULL FROM customers WHERE id = $1`, customerID).Scan(&suspended)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotFound
	}
	return suspended, err
}
