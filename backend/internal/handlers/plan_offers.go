package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/db"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/price"
	"github.com/stripe/stripe-go/v81/product"
	"github.com/stripe/stripe-go/v81/subscription"
)

// Custom plans (devlog 2026-11-11-custom-plan-offers.txt): support makes a
// plan for one organization in Airplane, the organization accepts it at
// /billing/offer/<id> and pays through Stripe like any other plan. The
// offer ID is the link; it only opens for someone who manages billing in
// that organization, so it doesn't need to be a secret.

type planOfferResponse struct {
	ID                    string `json:"id"`
	URL                   string `json:"url"`
	Status                string `json:"status"`
	PlanTierID            string `json:"planTierId"`
	PlanName              string `json:"planName"`
	MaxDomains            int    `json:"maxDomains"`
	MaxMailboxesPerDomain int    `json:"maxMailboxesPerDomain"`
	MaxOutgoingPerDay     int    `json:"maxOutgoingPerDay"`
	WebmailBranding       bool   `json:"webmailBranding"`
	Interval              string `json:"interval"`
	PriceCents            int64  `json:"priceCents"`
	CreatedBy             string `json:"createdBy,omitempty"`
	CreatedAt             string `json:"createdAt"`
	ExpiresAt             string `json:"expiresAt"`
	AcceptedAt            string `json:"acceptedAt,omitempty"`
}

func (a *App) toPlanOfferResponse(o *db.PlanOffer, plan *db.PlanTier) planOfferResponse {
	resp := planOfferResponse{
		ID:                    o.ID,
		URL:                   a.FrontendOrigin + "/billing/offer/" + o.ID,
		Status:                o.Status(time.Now()),
		PlanTierID:            plan.ID,
		PlanName:              plan.Name,
		MaxDomains:            plan.MaxDomains,
		MaxMailboxesPerDomain: plan.MaxMailboxesPerDomain,
		MaxOutgoingPerDay:     plan.MaxOutgoingPerDay,
		WebmailBranding:       plan.WebmailBranding,
		Interval:              o.BillingInterval,
		PriceCents:            plan.PriceCentsAnnual.Int64,
		CreatedAt:             o.CreatedAt.Format(time.RFC3339),
		ExpiresAt:             o.ExpiresAt.Format(time.RFC3339),
	}
	if o.BillingInterval == "monthly" {
		resp.PriceCents = plan.PriceCentsMonthly.Int64
	}
	if o.AcceptedAt.Valid {
		resp.AcceptedAt = o.AcceptedAt.Time.Format(time.RFC3339)
	}
	return resp
}

// loadOrganizationOffer loads an offer for someone in the organization it
// was made for; any other organization gets a 404, not a 403.
func (a *App) loadOrganizationOffer(w http.ResponseWriter, r *http.Request, organizationID string) (*db.PlanOffer, *db.PlanTier, bool) {
	offer, err := a.Store.GetPlanOffer(r.Context(), r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) || (err == nil && offer.OrganizationID != organizationID) {
		writeError(w, http.StatusNotFound, "this offer doesn't exist")
		return nil, nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load offer")
		return nil, nil, false
	}
	plan, err := a.Store.GetPlanTierByID(r.Context(), offer.PlanTierID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load plan")
		return nil, nil, false
	}
	return offer, plan, true
}

// GetPlanOffer -> GET /api/billing/offers/{id}
func (a *App) GetPlanOffer(w http.ResponseWriter, r *http.Request) {
	_, cust, ok := a.resolveBillingCustomer(w, r, false)
	if !ok {
		return
	}
	offer, plan, ok := a.loadOrganizationOffer(w, r, cust.OrganizationID.String)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, a.toPlanOfferResponse(offer, plan))
}

// AcceptPlanOffer -> POST /api/billing/offers/{id}/accept. Without a
// subscription this opens Stripe Checkout and the webhook applies the plan.
// With one, the subscription moves to the offer's price and the difference
// is invoiced right away, so there are never two subscriptions side by side.
func (a *App) AcceptPlanOffer(w http.ResponseWriter, r *http.Request) {
	defer a.RequestSendingLimitsSync()
	if !a.StripeEnabled {
		writeError(w, http.StatusServiceUnavailable, "billing is not available yet")
		return
	}
	actor, cust, ok := a.resolveBillingCustomer(w, r, true)
	if !ok {
		return
	}
	offer, plan, ok := a.loadOrganizationOffer(w, r, cust.OrganizationID.String)
	if !ok {
		return
	}
	if status := offer.Status(time.Now()); status != "open" {
		writeError(w, http.StatusConflict, "this offer is "+status)
		return
	}
	priceRef := plan.StripePriceIDAnnual.String
	if offer.BillingInterval == "monthly" {
		priceRef = plan.StripePriceIDMonthly.String
	}

	billing, err := a.Store.GetCustomerBilling(r.Context(), cust.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load billing info")
		return
	}
	auditMeta := map[string]any{"interval": offer.BillingInterval, "offerId": offer.ID}

	if !billing.StripeSubscriptionID.Valid || billing.StripeSubscriptionID.String == "" {
		url, ok := a.startCheckout(w, r, cust, plan, offer.BillingInterval, priceRef, "/billing/offer/"+offer.ID+"?checkout=cancelled", offer.ID)
		if !ok {
			return
		}
		a.Store.LogOrganizationAudit(r.Context(), actor.OrganizationID.String, &actor.ID, actor.Email,
			"billing.checkout_started", "billing", plan.ID, plan.Name, auditMeta, requestIP(r))
		writeJSON(w, http.StatusOK, map[string]string{"url": url})
		return
	}

	stripePriceID, err := resolveStripePrice(priceRef)
	if err != nil {
		log.Printf("stripe: resolve price %s for plan offer %s: %v", priceRef, offer.ID, err)
		writeStripeError(w, "could not switch plan", err)
		return
	}
	sub, err := subscription.Get(billing.StripeSubscriptionID.String, nil)
	if err != nil || len(sub.Items.Data) == 0 {
		log.Printf("stripe: get subscription %s for plan offer %s: %v", billing.StripeSubscriptionID.String, offer.ID, err)
		writeError(w, http.StatusBadGateway, "could not load your subscription")
		return
	}
	params := &stripe.SubscriptionParams{
		Items: []*stripe.SubscriptionItemsParams{
			{ID: stripe.String(sub.Items.Data[0].ID), Price: stripe.String(stripePriceID)},
		},
		ProrationBehavior: stripe.String("always_invoice"),
		// Accepting a plan means keeping it, even if the old one was set to end.
		CancelAtPeriodEnd: stripe.Bool(false),
	}
	params.AddMetadata("planTierId", plan.ID)
	params.AddMetadata("interval", offer.BillingInterval)
	params.AddMetadata("offerId", offer.ID)
	sub, err = subscription.Update(sub.ID, params)
	if err != nil {
		log.Printf("stripe: move subscription %s to plan offer %s: %v", sub.ID, offer.ID, err)
		writeStripeError(w, "could not switch plan", err)
		return
	}
	if err := a.Store.UpdateCustomerSubscriptionByCustomerID(r.Context(), cust.ID, plan.ID, offer.BillingInterval, billing.StripeCustomerID.String, sub.ID, string(sub.Status)); err != nil {
		writeError(w, http.StatusInternalServerError, "your subscription changed but we could not save it, please contact support")
		return
	}
	if err := a.Store.MarkPlanOfferAccepted(r.Context(), offer.ID); err != nil {
		log.Printf("plan offer %s: mark accepted: %v", offer.ID, err)
	}
	a.Store.LogOrganizationAudit(r.Context(), actor.OrganizationID.String, &actor.ID, actor.Email,
		"billing.offer_accepted", "billing", plan.ID, plan.Name, auditMeta, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]string{"url": a.FrontendOrigin + "/billing/overview?checkout=success"})
}

// AdminListPlanOffers -> GET /internal/admin/customers/{id}/plan-offers,
// every offer made to the customer's organization.
func (a *App) AdminListPlanOffers(w http.ResponseWriter, r *http.Request, operator string) {
	cust, err := a.Store.GetCustomerByID(r.Context(), r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load customer")
		return
	}
	out := []planOfferResponse{}
	if !cust.OrganizationID.Valid {
		writeJSON(w, http.StatusOK, out)
		return
	}
	offers, err := a.Store.ListPlanOffers(r.Context(), cust.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load offers")
		return
	}
	for i := range offers {
		plan, err := a.Store.GetPlanTierByID(r.Context(), offers[i].PlanTierID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load plan")
			return
		}
		resp := a.toPlanOfferResponse(&offers[i], plan)
		resp.CreatedBy = offers[i].CreatedBy
		out = append(out, resp)
	}
	writeJSON(w, http.StatusOK, out)
}

type adminCreatePlanOfferRequest struct {
	Name                  string `json:"name"`
	MaxDomains            int    `json:"maxDomains"`
	MaxMailboxesPerDomain int    `json:"maxMailboxesPerDomain"`
	MaxOutgoingPerDay     int    `json:"maxOutgoingPerDay"`
	WebmailBranding       bool   `json:"webmailBranding"`
	Interval              string `json:"interval"`
	PriceCents            int64  `json:"priceCents"`
	ExpiresInDays         int    `json:"expiresInDays"`
}

// AdminCreatePlanOffer -> POST /internal/admin/customers/{id}/plan-offers.
// Makes the plan tier, its Stripe product and price, and the offer for the
// customer's organization. The Stripe price is created first: a failed
// insert afterwards only leaves an unused price behind, never a tier that
// can't be paid for.
func (a *App) AdminCreatePlanOffer(w http.ResponseWriter, r *http.Request, operator string) {
	if !a.StripeEnabled {
		writeError(w, http.StatusServiceUnavailable, "billing is not available on this server")
		return
	}
	cust, err := a.Store.GetCustomerByID(r.Context(), r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load customer")
		return
	}
	if !cust.OrganizationID.Valid {
		writeError(w, http.StatusConflict, "customer has no organization")
		return
	}

	var req adminCreatePlanOfferRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.ExpiresInDays == 0 {
		req.ExpiresInDays = 30
	}
	switch {
	case req.Name == "":
		writeError(w, http.StatusBadRequest, "name is required")
		return
	case req.MaxDomains < 1 || req.MaxMailboxesPerDomain < 1 || req.MaxOutgoingPerDay < 0:
		writeError(w, http.StatusBadRequest, "domains and mailboxes must be at least 1, outgoing per day at least 0")
		return
	case req.Interval != "monthly" && req.Interval != "annual":
		writeError(w, http.StatusBadRequest, "interval must be \"monthly\" or \"annual\"")
		return
	case req.PriceCents < 100:
		writeError(w, http.StatusBadRequest, "price must be at least €1")
		return
	case req.ExpiresInDays < 1 || req.ExpiresInDays > 365:
		writeError(w, http.StatusBadRequest, "an offer expires after 1 to 365 days")
		return
	}

	suffix := make([]byte, 4)
	if _, err := rand.Read(suffix); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create plan")
		return
	}
	tierID := "custom-" + hex.EncodeToString(suffix)

	productParams := &stripe.ProductParams{Name: stripe.String("Amelu " + req.Name)}
	productParams.AddMetadata("planTierId", tierID)
	prod, err := product.New(productParams)
	if err != nil {
		log.Printf("stripe: create product for custom plan %s: %v", tierID, err)
		writeStripeError(w, "could not create the Stripe product", err)
		return
	}
	stripeInterval := "year"
	if req.Interval == "monthly" {
		stripeInterval = "month"
	}
	priceParams := &stripe.PriceParams{
		Product:    stripe.String(prod.ID),
		Currency:   stripe.String(string(stripe.CurrencyEUR)),
		UnitAmount: stripe.Int64(req.PriceCents),
		Recurring:  &stripe.PriceRecurringParams{Interval: stripe.String(stripeInterval)},
		LookupKey:  stripe.String("amelu_" + tierID + "_" + req.Interval),
	}
	priceParams.AddMetadata("planTierId", tierID)
	pr, err := price.New(priceParams)
	if err != nil {
		log.Printf("stripe: create price for custom plan %s: %v", tierID, err)
		writeStripeError(w, "could not create the Stripe price", err)
		return
	}

	offer, err := a.Store.CreatePlanOffer(r.Context(), cust.OrganizationID.String, operator, db.NewCustomPlan{
		TierID:                tierID,
		Name:                  req.Name,
		MaxDomains:            req.MaxDomains,
		MaxMailboxesPerDomain: req.MaxMailboxesPerDomain,
		MaxOutgoingPerDay:     req.MaxOutgoingPerDay,
		WebmailBranding:       req.WebmailBranding,
		BillingInterval:       req.Interval,
		PriceCents:            req.PriceCents,
		StripePriceID:         pr.ID,
	}, time.Now().AddDate(0, 0, req.ExpiresInDays))
	if err != nil {
		log.Printf("plan offer: create for customer %s (Stripe price %s left unused): %v", cust.ID, pr.ID, err)
		writeError(w, http.StatusInternalServerError, "could not save the offer")
		return
	}
	plan, err := a.Store.GetPlanTierByID(r.Context(), tierID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "offer created but could not reload it")
		return
	}
	a.Store.LogAdminAction(r.Context(), "customer", cust.ID, operator, "plan_offer.created", "Custom plan "+req.Name+" offered ("+tierID+")")
	writeJSON(w, http.StatusCreated, a.toPlanOfferResponse(offer, plan))
}

// AdminRevokePlanOffer -> POST /internal/admin/plan-offers/{id}/revoke. The
// plan tier stays: it may already be in use if the offer was accepted.
func (a *App) AdminRevokePlanOffer(w http.ResponseWriter, r *http.Request, operator string) {
	id := r.PathValue("id")
	if err := a.Store.RevokePlanOffer(r.Context(), id); errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusConflict, "this offer was already accepted or revoked")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not revoke offer")
		return
	}
	a.Store.LogAdminAction(r.Context(), "plan_offer", id, operator, "plan_offer.revoked", "Plan offer revoked")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
