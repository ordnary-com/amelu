package db

import "context"

// DomainPlan is a customer domain with the plan of the organization that owns it.
type DomainPlan struct {
	Name       string
	PlanTierID string
}

// ListDomainPlans returns every domain that isn't failed, with its
// organization's plan (the owner's, as for the other plan limits).
func (s *Store) ListDomainPlans(ctx context.Context) ([]DomainPlan, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT lower(d.name), COALESCE((
			SELECT o.plan_tier_id FROM customers o
			JOIN organization_members m ON m.customer_id = o.id
			WHERE m.organization_id = c.organization_id AND m.role = 'owner'
			ORDER BY o.created_at ASC LIMIT 1
		), c.plan_tier_id)
		FROM domains d
		JOIN customers c ON c.id = d.customer_id
		WHERE d.status <> 'failed'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DomainPlan
	for rows.Next() {
		var p DomainPlan
		if err := rows.Scan(&p.Name, &p.PlanTierID); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListOutgoingLimits returns max_outgoing_per_day by plan tier id.
func (s *Store) ListOutgoingLimits(ctx context.Context) (map[string]int, error) {
	rows, err := s.conn.QueryContext(ctx, `SELECT id, max_outgoing_per_day FROM plan_tiers`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, err
		}
		out[id] = n
	}
	return out, rows.Err()
}
