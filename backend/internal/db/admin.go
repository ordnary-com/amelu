package db

// Store methods here are only ever called from the /internal/admin/* surface
// (see internal/auth/admin.go, internal/handlers/admin.go) - cross-customer
// queries that would be a data leak if reachable from any customer-facing
// /api/* route. Every one of them is unscoped by design.

import (
	"context"
)

// SearchCustomers finds customers by email, organization name or username
// (case-insensitive substring match), for Helm's admin customer search. An
// empty query returns the most recently created customers first, so the
// list page has something to show before a search is typed.
func (s *Store) SearchCustomers(ctx context.Context, query string, limit int) ([]CustomerProfile, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.conn.QueryContext(ctx, `
		SELECT c.id, c.email, c.name, c.plan_tier_id, pt.name, o.id, o.name, c.last_sign_in_at, c.first_name, c.last_name, c.username
		FROM customers c
		JOIN plan_tiers pt ON pt.id = c.plan_tier_id
		JOIN organizations o ON o.id = c.organization_id
		WHERE $1 = '' OR c.email ILIKE '%' || $1 || '%' OR o.name ILIKE '%' || $1 || '%' OR c.username ILIKE '%' || $1 || '%'
		ORDER BY c.created_at DESC
		LIMIT $2
	`, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CustomerProfile
	for rows.Next() {
		var p CustomerProfile
		if err := rows.Scan(&p.ID, &p.Email, &p.Name, &p.PlanTierID, &p.PlanTierName, &p.OrganizationID, &p.OrganizationName, &p.LastSignInAt, &p.FirstName, &p.LastName, &p.Username); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
