package handlers

import (
	"log"
	"time"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/promotioncode"
)

// Stripe promotion codes have an expiry but no start, so campaign codes for
// later days (Black Friday 2026 on amelu-landing) are created inactive with
// metadata activate_at (RFC 3339). ActivateDuePromotionCodes, run every few
// minutes from cmd/api/main.go, switches them on once that moment passes.

const promotionActivateAtKey = "activate_at"

// promotionDue reports whether an inactive code should be switched on now:
// its activate_at has passed and it hasn't expired.
func promotionDue(metadata map[string]string, expiresAt int64, now time.Time) bool {
	raw, ok := metadata[promotionActivateAtKey]
	if !ok {
		return false
	}
	at, err := time.Parse(time.RFC3339, raw)
	if err != nil || now.Before(at) {
		return false
	}
	return expiresAt == 0 || now.Unix() < expiresAt
}

// ActivateDuePromotionCodes switches on every inactive promotion code whose
// activate_at has passed. No-op without Stripe.
func (a *App) ActivateDuePromotionCodes() {
	if !a.StripeEnabled {
		return
	}
	now := time.Now()
	params := &stripe.PromotionCodeListParams{Active: stripe.Bool(false)}
	params.Limit = stripe.Int64(100)
	it := promotioncode.List(params)
	for it.Next() {
		pc := it.PromotionCode()
		if !promotionDue(pc.Metadata, pc.ExpiresAt, now) {
			continue
		}
		if _, err := promotioncode.Update(pc.ID, &stripe.PromotionCodeParams{Active: stripe.Bool(true)}); err != nil {
			log.Printf("promotions: could not activate %s (%s): %v", pc.Code, pc.ID, err)
			continue
		}
		log.Printf("promotions: activated %s (%s), due %s", pc.Code, pc.ID, pc.Metadata[promotionActivateAtKey])
	}
	if err := it.Err(); err != nil {
		log.Printf("promotions: could not list inactive promotion codes: %v", err)
	}
}
