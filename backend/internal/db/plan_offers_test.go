package db

import (
	"context"
	"errors"
	"testing"
	"time"
)

func newTestPlanOffer(t *testing.T, s *Store, orgID string, expiresAt time.Time) *PlanOffer {
	t.Helper()
	ctx := context.Background()
	tierID := "custom-test-" + randomSuffix(t)
	offer, err := s.CreatePlanOffer(ctx, orgID, "support@example.com", NewCustomPlan{
		TierID: tierID, Name: "Agency", MaxDomains: 500, MaxMailboxesPerDomain: 10000, MaxOutgoingPerDay: 1000,
		BillingInterval: "annual", PriceCents: 15000, StripePriceID: "price_test",
	}, expiresAt)
	if err != nil {
		t.Fatalf("create plan offer: %v", err)
	}
	t.Cleanup(func() {
		s.conn.ExecContext(context.Background(), `DELETE FROM plan_offers WHERE plan_tier_id = $1`, tierID)
		s.conn.ExecContext(context.Background(), `DELETE FROM plan_tiers WHERE id = $1`, tierID)
	})
	return offer
}

func TestCreatePlanOffer_MakesHiddenStripeTier(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, _ := newTestOrgWithOwner(t, s)
	offer := newTestPlanOffer(t, s, orgID, time.Now().Add(time.Hour))

	plan, err := s.GetPlanTierByID(ctx, offer.PlanTierID)
	if err != nil {
		t.Fatalf("load tier: %v", err)
	}
	if !plan.Custom || plan.MaxDomains != 500 || plan.MaxOutgoingPerDay != 1000 || plan.PriceCentsAnnual.Int64 != 15000 || plan.PriceCentsMonthly.Valid {
		t.Fatalf("unexpected tier %+v", plan)
	}
	// The webhook maps a subscription's price back to this tier.
	if byPrice, err := s.GetPlanTierByStripePriceID(ctx, "price_test"); err != nil || byPrice.ID != plan.ID {
		t.Fatalf("tier not found by its Stripe price: %v %+v", err, byPrice)
	}
	if got := offer.Status(time.Now()); got != "open" {
		t.Fatalf("new offer status = %q, want open", got)
	}
}

func TestPlanOffer_RevokeAndAccept(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, _ := newTestOrgWithOwner(t, s)

	revoked := newTestPlanOffer(t, s, orgID, time.Now().Add(time.Hour))
	if err := s.RevokePlanOffer(ctx, revoked.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if err := s.RevokePlanOffer(ctx, revoked.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second revoke should be ErrNotFound, got %v", err)
	}

	accepted := newTestPlanOffer(t, s, orgID, time.Now().Add(time.Hour))
	if err := s.MarkPlanOfferAccepted(ctx, accepted.ID); err != nil {
		t.Fatalf("accept: %v", err)
	}
	if err := s.RevokePlanOffer(ctx, accepted.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoking an accepted offer should be ErrNotFound, got %v", err)
	}

	offers, err := s.ListPlanOffers(ctx, orgID)
	if err != nil || len(offers) != 2 {
		t.Fatalf("list: %v, %d offers", err, len(offers))
	}
	statuses := map[string]string{}
	for i := range offers {
		statuses[offers[i].ID] = offers[i].Status(time.Now())
	}
	if statuses[revoked.ID] != "revoked" || statuses[accepted.ID] != "accepted" {
		t.Fatalf("statuses = %v", statuses)
	}
}

func TestGetPlanOffer_MalformedIDIsNotFound(t *testing.T) {
	s := testStore(t)
	if _, err := s.GetPlanOffer(context.Background(), "not-a-uuid"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestPlanOfferStatus_Expired(t *testing.T) {
	o := &PlanOffer{ExpiresAt: time.Now().Add(-time.Minute)}
	if got := o.Status(time.Now()); got != "expired" {
		t.Fatalf("status = %q, want expired", got)
	}
}
