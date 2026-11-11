package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type PlanOffer struct {
	ID              string
	OrganizationID  string
	PlanTierID      string
	BillingInterval string
	CreatedBy       string
	CreatedAt       time.Time
	ExpiresAt       time.Time
	AcceptedAt      sql.NullTime
	RevokedAt       sql.NullTime
}

// Status is open, accepted, revoked or expired.
func (o *PlanOffer) Status(now time.Time) string {
	switch {
	case o.AcceptedAt.Valid:
		return "accepted"
	case o.RevokedAt.Valid:
		return "revoked"
	case !now.Before(o.ExpiresAt):
		return "expired"
	}
	return "open"
}

const planOfferColumns = `id, organization_id, plan_tier_id, billing_interval, created_by, created_at, expires_at, accepted_at, revoked_at`

func scanPlanOffer(row interface {
	Scan(dest ...any) error
}) (*PlanOffer, error) {
	o := &PlanOffer{}
	err := row.Scan(&o.ID, &o.OrganizationID, &o.PlanTierID, &o.BillingInterval, &o.CreatedBy, &o.CreatedAt, &o.ExpiresAt, &o.AcceptedAt, &o.RevokedAt)
	return o, err
}

type NewCustomPlan struct {
	TierID                string
	Name                  string
	MaxDomains            int
	MaxMailboxesPerDomain int
	MaxOutgoingPerDay     int
	WebmailBranding       bool
	BillingInterval       string
	PriceCents            int64
	StripePriceID         string
}

// CreatePlanOffer adds a custom plan tier and the offer for it together, so
// a tier never exists without the offer that explains whose it is.
func (s *Store) CreatePlanOffer(ctx context.Context, organizationID, createdBy string, plan NewCustomPlan, expiresAt time.Time) (*PlanOffer, error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var monthlyCents, annualCents sql.NullInt64
	var monthlyPrice, annualPrice sql.NullString
	if plan.BillingInterval == "monthly" {
		monthlyCents = sql.NullInt64{Int64: plan.PriceCents, Valid: true}
		monthlyPrice = sql.NullString{String: plan.StripePriceID, Valid: true}
	} else {
		annualCents = sql.NullInt64{Int64: plan.PriceCents, Valid: true}
		annualPrice = sql.NullString{String: plan.StripePriceID, Valid: true}
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO plan_tiers (id, name, max_domains, max_mailboxes_per_domain, max_outgoing_per_day, webmail_branding,
			billing_provider, price_cents_monthly, price_cents_annual, stripe_price_id_monthly, stripe_price_id_annual, custom)
		VALUES ($1, $2, $3, $4, $5, $6, 'stripe', $7, $8, $9, $10, true)
	`, plan.TierID, plan.Name, plan.MaxDomains, plan.MaxMailboxesPerDomain, plan.MaxOutgoingPerDay, plan.WebmailBranding,
		monthlyCents, annualCents, monthlyPrice, annualPrice); err != nil {
		return nil, err
	}

	offer, err := scanPlanOffer(tx.QueryRowContext(ctx, `
		INSERT INTO plan_offers (organization_id, plan_tier_id, billing_interval, created_by, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+planOfferColumns,
		organizationID, plan.TierID, plan.BillingInterval, createdBy, expiresAt))
	if err != nil {
		return nil, err
	}
	return offer, tx.Commit()
}

// GetPlanOffer compares as text so an ID from a mangled link is simply not
// found instead of a uuid syntax error.
func (s *Store) GetPlanOffer(ctx context.Context, id string) (*PlanOffer, error) {
	o, err := scanPlanOffer(s.conn.QueryRowContext(ctx, `SELECT `+planOfferColumns+` FROM plan_offers WHERE id::text = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return o, nil
}

// ListPlanOffers returns an organization's offers, newest first.
func (s *Store) ListPlanOffers(ctx context.Context, organizationID string) ([]PlanOffer, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT `+planOfferColumns+` FROM plan_offers WHERE organization_id = $1 ORDER BY created_at DESC
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlanOffer
	for rows.Next() {
		o, err := scanPlanOffer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, rows.Err()
}

// RevokePlanOffer only touches an offer that is still open.
func (s *Store) RevokePlanOffer(ctx context.Context, id string) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE plan_offers SET revoked_at = now()
		WHERE id::text = $1 AND accepted_at IS NULL AND revoked_at IS NULL
	`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) MarkPlanOfferAccepted(ctx context.Context, id string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE plan_offers SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL`, id)
	return err
}
