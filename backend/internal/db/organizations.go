package db

import (
	"context"
	"database/sql"
	"errors"
)

// GetOrganizationByID is only ever called from the admin surface - customer
// requests never look up an org by bare ID, they get it joined onto their
// own profile (see GetCustomerProfile).
func (s *Store) GetOrganizationByID(ctx context.Context, id string) (*Organization, error) {
	o := &Organization{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT id, name, created_at FROM organizations WHERE id = $1
	`, id).Scan(&o.ID, &o.Name, &o.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return o, nil
}

func (s *Store) UpdateOrganizationName(ctx context.Context, id, name string) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE organizations SET name = $1 WHERE id = $2`, name, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
