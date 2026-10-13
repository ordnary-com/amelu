package db

import (
	"context"
	"database/sql"
)

// DomainPreference is one customer's favorite flag and position for a domain.
type DomainPreference struct {
	Favorite bool
	Position sql.NullInt32
}

// ListDomainPreferences returns the customer's preferences keyed by domain id;
// domains without a row have the zero value (not a favorite, no position).
func (s *Store) ListDomainPreferences(ctx context.Context, customerID string) (map[string]DomainPreference, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT domain_id, favorite, position FROM customer_domain_preferences WHERE customer_id = $1
	`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]DomainPreference{}
	for rows.Next() {
		var id string
		var p DomainPreference
		if err := rows.Scan(&id, &p.Favorite, &p.Position); err != nil {
			return nil, err
		}
		out[id] = p
	}
	return out, rows.Err()
}

func (s *Store) SetDomainFavorite(ctx context.Context, customerID, domainID string, favorite bool) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO customer_domain_preferences (customer_id, domain_id, favorite)
		VALUES ($1, $2, $3)
		ON CONFLICT (customer_id, domain_id) DO UPDATE SET favorite = EXCLUDED.favorite
	`, customerID, domainID, favorite)
	return err
}

// SetDomainOrder stores domainIDs as the customer's order, first to last.
// Callers make sure every id belongs to the customer's organization.
func (s *Store) SetDomainOrder(ctx context.Context, customerID string, domainIDs []string) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for i, id := range domainIDs {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO customer_domain_preferences (customer_id, domain_id, position)
			VALUES ($1, $2, $3)
			ON CONFLICT (customer_id, domain_id) DO UPDATE SET position = EXCLUDED.position
		`, customerID, id, i); err != nil {
			return err
		}
	}
	return tx.Commit()
}
