package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type APIKey struct {
	ID         string
	CustomerID string
	Name       string
	KeyHash    string
	Prefix     string
	LastUsedAt sql.NullTime
	RevokedAt  sql.NullTime
	CreatedAt  time.Time
}

const apiKeyColumns = `id, customer_id, name, key_hash, prefix, last_used_at, revoked_at, created_at`

func scanAPIKey(row interface {
	Scan(dest ...any) error
}) (*APIKey, error) {
	k := &APIKey{}
	err := row.Scan(&k.ID, &k.CustomerID, &k.Name, &k.KeyHash, &k.Prefix, &k.LastUsedAt, &k.RevokedAt, &k.CreatedAt)
	return k, err
}

func (s *Store) CreateAPIKey(ctx context.Context, customerID, name, keyHash, prefix string) (*APIKey, error) {
	row := s.conn.QueryRowContext(ctx, `
		INSERT INTO api_keys (customer_id, name, key_hash, prefix)
		VALUES ($1, $2, $3, $4)
		RETURNING `+apiKeyColumns,
		customerID, name, keyHash, prefix)
	return scanAPIKey(row)
}

// ListAPIKeys returns the customer's keys, revoked ones excluded - a revoked
// key can never be used or un-revoked, so keeping it on screen would only
// invite the reader to think it still means something.
func (s *Store) ListAPIKeys(ctx context.Context, customerID string) ([]APIKey, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT `+apiKeyColumns+`
		FROM api_keys
		WHERE customer_id = $1 AND revoked_at IS NULL
		ORDER BY created_at DESC
	`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []APIKey
	for rows.Next() {
		k, err := scanAPIKey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *k)
	}
	return out, rows.Err()
}

func (s *Store) RevokeAPIKey(ctx context.Context, customerID, keyID string) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE api_keys SET revoked_at = now()
		WHERE id = $1 AND customer_id = $2 AND revoked_at IS NULL
	`, keyID, customerID)
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

// GetCustomerByAPIKeyHash is the API-key equivalent of
// GetCustomerBySessionToken. last_used_at is updated on the way through so
// the list page can show whether a key is still in use; it's a separate
// statement rather than a CTE because a failed touch must not fail the
// request.
func (s *Store) GetCustomerByAPIKeyHash(ctx context.Context, keyHash string) (*Customer, error) {
	c := &Customer{}
	var keyID string
	err := s.conn.QueryRowContext(ctx, `
		SELECT k.id, c.id, c.email, c.name, c.password_hash, c.plan_tier_id, c.organization_id, c.last_sign_in_at, c.created_at
		FROM api_keys k
		JOIN customers c ON c.id = k.customer_id
		WHERE k.key_hash = $1 AND k.revoked_at IS NULL
	`, keyHash).Scan(&keyID, &c.ID, &c.Email, &c.Name, &c.PasswordHash, &c.PlanTierID, &c.OrganizationID, &c.LastSignInAt, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	s.conn.ExecContext(ctx, `UPDATE api_keys SET last_used_at = now() WHERE id = $1`, keyID)
	return c, nil
}
