package db

import (
	"context"
	"database/sql"
	"errors"
)

// Domains and mailboxes are still stored against the customer who created
// them (domains.customer_id - see 0001_init.sql), but with teams, every
// member of the organization needs to see and manage every domain the
// organization owns, not just the ones they personally created. These
// methods scope by organization instead of by the single creating
// customer - used by every dashboard-facing handler once a team's
// membership has been resolved. GetDomain/ListDomains/CountDomains/
// DeleteDomain (store.go) remain customer-scoped and are still used by
// account termination and the Helm cross-customer admin surface, which
// must never be widened to "every domain in the organization".

func (s *Store) ListDomainsForOrganization(ctx context.Context, organizationID string) ([]Domain, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT `+domainColumns+`
		FROM domains
		WHERE customer_id IN (SELECT id FROM customers WHERE organization_id = $1)
		ORDER BY created_at DESC
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Domain
	for rows.Next() {
		d, err := scanDomain(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

func (s *Store) GetDomainForOrganization(ctx context.Context, organizationID, domainID string) (*Domain, error) {
	row := s.conn.QueryRowContext(ctx, `
		SELECT `+domainColumns+`
		FROM domains
		WHERE id = $1 AND customer_id IN (SELECT id FROM customers WHERE organization_id = $2)
	`, domainID, organizationID)
	d, err := scanDomain(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Store) DeleteDomainForOrganization(ctx context.Context, organizationID, domainID string) error {
	res, err := s.conn.ExecContext(ctx, `
		DELETE FROM domains
		WHERE id = $1 AND customer_id IN (SELECT id FROM customers WHERE organization_id = $2)
	`, domainID, organizationID)
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

// CountDomainsForOrganization excludes 'failed' domains, same as
// CountDomains (store.go) - a failed provisioning attempt never occupied a
// plan slot in Stalwart.
func (s *Store) CountDomainsForOrganization(ctx context.Context, organizationID string) (int, error) {
	var n int
	err := s.conn.QueryRowContext(ctx, `
		SELECT count(*) FROM domains
		WHERE customer_id IN (SELECT id FROM customers WHERE organization_id = $1) AND status != 'failed'
	`, organizationID).Scan(&n)
	return n, err
}

// GetOrganizationPlanTierID resolves the plan tier that should govern this
// organization's domain/mailbox limits. Plan tiers are still a per-customer
// column (billing hasn't been made organization-aware - out of scope for
// this change), so the organization's owner is treated as the plan holder:
// every domain/mailbox limit check for any team member uses the owner's
// plan, not the acting member's own (usually free-tier default) row.
func (s *Store) GetOrganizationPlanTierID(ctx context.Context, organizationID string) (string, error) {
	var planTierID string
	err := s.conn.QueryRowContext(ctx, `
		SELECT c.plan_tier_id
		FROM customers c
		JOIN organization_members m ON m.customer_id = c.id
		WHERE m.organization_id = $1 AND m.role = 'owner'
		ORDER BY c.created_at ASC
		LIMIT 1
	`, organizationID).Scan(&planTierID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return planTierID, err
}

// GetOrganizationOwnerCustomer returns the organization's (oldest) owner -
// used to resolve billing state for the whole organization (see
// internal/handlers/billing.go) and to reassign a departing member's
// domains (see RemoveMember).
func (s *Store) GetOrganizationOwnerCustomer(ctx context.Context, organizationID string) (*Customer, error) {
	c := &Customer{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT c.id, c.email, c.name, c.password_hash, c.plan_tier_id, c.organization_id, c.last_sign_in_at, c.created_at
		FROM customers c
		JOIN organization_members m ON m.customer_id = c.id
		WHERE m.organization_id = $1 AND m.role = 'owner'
		ORDER BY c.created_at ASC
		LIMIT 1
	`, organizationID).Scan(&c.ID, &c.Email, &c.Name, &c.PasswordHash, &c.PlanTierID, &c.OrganizationID, &c.LastSignInAt, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}
