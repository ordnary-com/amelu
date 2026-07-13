package db

import (
	"context"
	"database/sql"
	"errors"
)

type PlanTier struct {
	ID                    string
	Name                  string
	MaxDomains            int
	MaxMailboxesPerDomain int
	BillingProvider       sql.NullString
	PriceCentsMonthly     sql.NullInt64
	PriceCentsAnnual      sql.NullInt64
	StripePriceIDMonthly  sql.NullString
	StripePriceIDAnnual   sql.NullString
}

const planTierColumns = `id, name, max_domains, max_mailboxes_per_domain, billing_provider,
	price_cents_monthly, price_cents_annual, stripe_price_id_monthly, stripe_price_id_annual`

func scanPlanTier(row interface {
	Scan(dest ...any) error
}) (*PlanTier, error) {
	p := &PlanTier{}
	err := row.Scan(
		&p.ID, &p.Name, &p.MaxDomains, &p.MaxMailboxesPerDomain, &p.BillingProvider,
		&p.PriceCentsMonthly, &p.PriceCentsAnnual, &p.StripePriceIDMonthly, &p.StripePriceIDAnnual,
	)
	return p, err
}

func (s *Store) ListPlanTiers(ctx context.Context) ([]PlanTier, error) {
	rows, err := s.conn.QueryContext(ctx, `SELECT `+planTierColumns+` FROM plan_tiers ORDER BY price_cents_annual NULLS FIRST`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PlanTier
	for rows.Next() {
		p, err := scanPlanTier(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (s *Store) GetPlanTierByID(ctx context.Context, id string) (*PlanTier, error) {
	row := s.conn.QueryRowContext(ctx, `SELECT `+planTierColumns+` FROM plan_tiers WHERE id = $1`, id)
	p, err := scanPlanTier(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

// GetPlanTierByStripePriceID maps a Stripe Price ID (either the monthly or
// annual price of a plan tier) back to our own plan tier - used when a
// subscription.updated webhook reports a price change made from within the
// Stripe billing portal itself, not through our own checkout flow.
func (s *Store) GetPlanTierByStripePriceID(ctx context.Context, priceID string) (*PlanTier, error) {
	row := s.conn.QueryRowContext(ctx, `
		SELECT `+planTierColumns+`
		FROM plan_tiers
		WHERE billing_provider = 'stripe' AND (stripe_price_id_monthly = $1 OR stripe_price_id_annual = $1)
	`, priceID)
	p, err := scanPlanTier(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

type CustomerBilling struct {
	PlanTierID           string
	StripeCustomerID     sql.NullString
	StripeSubscriptionID sql.NullString
	SubscriptionStatus   sql.NullString
	BillingInterval      sql.NullString
}

func (s *Store) GetCustomerBilling(ctx context.Context, customerID string) (*CustomerBilling, error) {
	b := &CustomerBilling{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT plan_tier_id, stripe_customer_id, stripe_subscription_id, subscription_status, billing_interval
		FROM customers WHERE id = $1
	`, customerID).Scan(&b.PlanTierID, &b.StripeCustomerID, &b.StripeSubscriptionID, &b.SubscriptionStatus, &b.BillingInterval)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}

func (s *Store) SetCustomerStripeCustomerID(ctx context.Context, customerID, stripeCustomerID string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE customers SET stripe_customer_id = $1 WHERE id = $2`, stripeCustomerID, customerID)
	return err
}

// UpdateCustomerSubscriptionByCustomerID applies a subscription change we
// initiated ourselves (checkout.session.completed), where we already know
// our own customer ID from the session's metadata.
func (s *Store) UpdateCustomerSubscriptionByCustomerID(ctx context.Context, customerID, planTierID, billingInterval, stripeCustomerID, stripeSubscriptionID, status string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE customers
		SET plan_tier_id = $1, billing_interval = $2, stripe_customer_id = $3, stripe_subscription_id = $4, subscription_status = $5
		WHERE id = $6
	`, planTierID, billingInterval, stripeCustomerID, stripeSubscriptionID, status, customerID)
	return err
}

// UpdateCustomerSubscriptionByStripeCustomerID applies a subscription change
// reported by Stripe itself (customer.subscription.updated), where the
// webhook payload only gives us the Stripe customer ID, not our own.
func (s *Store) UpdateCustomerSubscriptionByStripeCustomerID(ctx context.Context, stripeCustomerID, planTierID, billingInterval, stripeSubscriptionID, status string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE customers
		SET plan_tier_id = $1, billing_interval = $2, stripe_subscription_id = $3, subscription_status = $4
		WHERE stripe_customer_id = $5
	`, planTierID, billingInterval, stripeSubscriptionID, status, stripeCustomerID)
	return err
}

// UpdateCustomerSubscriptionStatusByStripeCustomerID refreshes status and
// subscription id without touching the plan assignment - used when a
// subscription.updated webhook reports a price we don't recognize (so we
// can't map it back to one of our plan tiers) but still need to record the
// status change.
func (s *Store) UpdateCustomerSubscriptionStatusByStripeCustomerID(ctx context.Context, stripeCustomerID, stripeSubscriptionID, status string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE customers
		SET stripe_subscription_id = $1, subscription_status = $2
		WHERE stripe_customer_id = $3
	`, stripeSubscriptionID, status, stripeCustomerID)
	return err
}

// DowngradeCustomerToFreeByStripeCustomerID handles
// customer.subscription.deleted - the subscription is gone entirely, so the
// customer falls back to the free plan rather than being left pointing at a
// subscription ID that no longer exists.
func (s *Store) DowngradeCustomerToFreeByStripeCustomerID(ctx context.Context, stripeCustomerID string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE customers
		SET plan_tier_id = 'free', billing_interval = NULL, stripe_subscription_id = NULL, subscription_status = 'none'
		WHERE stripe_customer_id = $1
	`, stripeCustomerID)
	return err
}
