package handlers

import (
	"errors"
	"log"
	"net/http"
	"time"

	"amelu/backend/internal/db"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/invoice"
	"github.com/stripe/stripe-go/v81/subscription"
)

// This file extends the admin surface (see admin.go) with subscription
// management - changing a customer's plan, cancelling/reactivating, and
// reading their invoice history. Unlike admin.go's domain/mailbox actions,
// these touch Stripe directly, so every mutating action here additionally
// requires the customer to already have a live Stripe subscription; there's
// nothing to "manage" for a customer still on the free plan.

type adminPlanTierResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Purchasable bool   `json:"purchasable"`
}

// AdminListPlanTiers -> GET /internal/admin/plan-tiers. Feeds the "change
// plan" dropdown in Helm - only tiers with both Stripe prices configured
// are worth offering, but returned regardless so a misconfigured tier is
// visible rather than silently missing.
func (a *App) AdminListPlanTiers(w http.ResponseWriter, r *http.Request, operator string) {
	tiers, err := a.Store.ListPlanTiers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load plan tiers")
		return
	}
	out := make([]adminPlanTierResponse, 0, len(tiers))
	for i := range tiers {
		t := &tiers[i]
		out = append(out, adminPlanTierResponse{
			ID:   t.ID,
			Name: t.Name,
			Purchasable: t.BillingProvider.String == "stripe" &&
				t.StripePriceIDMonthly.Valid && t.StripePriceIDAnnual.Valid,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

type adminOrganizationResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

// AdminGetOrganization -> GET /internal/admin/organizations/{id}
func (a *App) AdminGetOrganization(w http.ResponseWriter, r *http.Request, operator string) {
	org, err := a.Store.GetOrganizationByID(r.Context(), r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "organization not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load organization")
		return
	}
	writeJSON(w, http.StatusOK, adminOrganizationResponse{ID: org.ID, Name: org.Name, CreatedAt: org.CreatedAt.Format(http.TimeFormat)})
}

type adminUpdateOrganizationRequest struct {
	Name string `json:"name"`
}

// AdminUpdateOrganization -> PATCH /internal/admin/organizations/{id}
func (a *App) AdminUpdateOrganization(w http.ResponseWriter, r *http.Request, operator string) {
	var req adminUpdateOrganizationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if err := a.Store.UpdateOrganizationName(r.Context(), r.PathValue("id"), req.Name); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "organization not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not update organization")
		return
	}
	a.Store.LogAdminAction(r.Context(), "organization", r.PathValue("id"), operator, "organization.renamed", "Renamed to "+req.Name)
	org, err := a.Store.GetOrganizationByID(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "updated but could not reload")
		return
	}
	writeJSON(w, http.StatusOK, adminOrganizationResponse{ID: org.ID, Name: org.Name, CreatedAt: org.CreatedAt.Format(http.TimeFormat)})
}

// requireCustomerSubscription loads the target customer's billing row and
// confirms it actually has a live Stripe subscription - shared by the three
// subscription-mutating handlers below.
func (a *App) requireCustomerSubscription(w http.ResponseWriter, r *http.Request, customerID string) (*db.CustomerBilling, bool) {
	if !a.StripeEnabled {
		writeError(w, http.StatusServiceUnavailable, "billing is not available on this server")
		return nil, false
	}
	billing, err := a.Store.GetCustomerBilling(r.Context(), customerID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "customer not found")
		return nil, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load billing info")
		return nil, false
	}
	if !billing.StripeSubscriptionID.Valid || billing.StripeSubscriptionID.String == "" {
		writeError(w, http.StatusConflict, "customer has no active Stripe subscription")
		return nil, false
	}
	return billing, true
}

type adminUpdateSubscriptionRequest struct {
	PlanTierID string `json:"planTierId"`
}

// AdminUpdateSubscription -> PATCH /internal/admin/customers/{id}/subscription.
// Moves a customer to a different plan tier by swapping the Stripe
// subscription's price to that plan's price for its CURRENT billing
// interval (monthly/annual) - admins pick a plan, not a billing cadence.
func (a *App) AdminUpdateSubscription(w http.ResponseWriter, r *http.Request, operator string) {
	customerID := r.PathValue("id")
	billing, ok := a.requireCustomerSubscription(w, r, customerID)
	if !ok {
		return
	}
	var req adminUpdateSubscriptionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	plan, err := a.Store.GetPlanTierByID(r.Context(), req.PlanTierID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "unknown plan tier")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load plan")
		return
	}

	interval := billing.BillingInterval.String
	if interval != "annual" {
		interval = "monthly"
	}
	priceID := plan.StripePriceIDMonthly
	if interval == "annual" {
		priceID = plan.StripePriceIDAnnual
	}
	if !priceID.Valid || priceID.String == "" {
		writeError(w, http.StatusBadRequest, "plan is not purchasable for this billing interval")
		return
	}

	sub, err := subscription.Get(billing.StripeSubscriptionID.String, nil)
	if err != nil || len(sub.Items.Data) == 0 {
		log.Printf("stripe: get subscription %s for admin plan change: %v", billing.StripeSubscriptionID.String, err)
		writeError(w, http.StatusBadGateway, "could not load Stripe subscription")
		return
	}
	itemID := sub.Items.Data[0].ID

	_, err = subscription.Update(billing.StripeSubscriptionID.String, &stripe.SubscriptionParams{
		Items: []*stripe.SubscriptionItemsParams{
			{ID: stripe.String(itemID), Price: stripe.String(priceID.String)},
		},
		ProrationBehavior: stripe.String("create_prorations"),
	})
	if err != nil {
		log.Printf("stripe: update subscription %s for admin plan change: %v", billing.StripeSubscriptionID.String, err)
		writeError(w, http.StatusBadGateway, "could not update Stripe subscription")
		return
	}

	if err := a.Store.UpdateCustomerSubscriptionByCustomerID(r.Context(), customerID, plan.ID, interval, billing.StripeCustomerID.String, billing.StripeSubscriptionID.String, "active"); err != nil {
		writeError(w, http.StatusInternalServerError, "subscription updated in Stripe but could not update records")
		return
	}
	a.Store.LogAdminAction(r.Context(), "customer", customerID, operator, "subscription.plan_changed", "Plan changed to "+plan.Name)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// AdminCancelSubscription -> POST /internal/admin/customers/{id}/subscription/cancel.
// Cancels at period end (not immediately) so the customer keeps access
// through what they already paid for - same behavior as Stripe's customer
// billing portal.
func (a *App) AdminCancelSubscription(w http.ResponseWriter, r *http.Request, operator string) {
	customerID := r.PathValue("id")
	billing, ok := a.requireCustomerSubscription(w, r, customerID)
	if !ok {
		return
	}
	_, err := subscription.Update(billing.StripeSubscriptionID.String, &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	})
	if err != nil {
		log.Printf("stripe: cancel subscription %s: %v", billing.StripeSubscriptionID.String, err)
		writeError(w, http.StatusBadGateway, "could not cancel Stripe subscription")
		return
	}
	a.Store.LogAdminAction(r.Context(), "customer", customerID, operator, "subscription.cancel_scheduled", "Subscription set to cancel at period end")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// AdminReactivateSubscription -> POST /internal/admin/customers/{id}/subscription/reactivate
func (a *App) AdminReactivateSubscription(w http.ResponseWriter, r *http.Request, operator string) {
	customerID := r.PathValue("id")
	billing, ok := a.requireCustomerSubscription(w, r, customerID)
	if !ok {
		return
	}
	_, err := subscription.Update(billing.StripeSubscriptionID.String, &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(false),
	})
	if err != nil {
		log.Printf("stripe: reactivate subscription %s: %v", billing.StripeSubscriptionID.String, err)
		writeError(w, http.StatusBadGateway, "could not reactivate Stripe subscription")
		return
	}
	a.Store.LogAdminAction(r.Context(), "customer", customerID, operator, "subscription.reactivated", "Pending cancellation undone")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// AdminListInvoices -> GET /internal/admin/customers/{id}/invoices
func (a *App) AdminListInvoices(w http.ResponseWriter, r *http.Request, operator string) {
	if !a.StripeEnabled {
		writeError(w, http.StatusServiceUnavailable, "billing is not available on this server")
		return
	}
	customerID := r.PathValue("id")
	billing, err := a.Store.GetCustomerBilling(r.Context(), customerID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load billing info")
		return
	}

	out := []invoiceResponse{}
	if billing.StripeCustomerID.Valid && billing.StripeCustomerID.String != "" {
		params := &stripe.InvoiceListParams{Customer: stripe.String(billing.StripeCustomerID.String)}
		params.Limit = stripe.Int64(100)
		it := invoice.List(params)
		for it.Next() {
			inv := it.Invoice()
			out = append(out, invoiceResponse{
				ID: inv.ID, Number: inv.Number, Status: string(inv.Status), Total: inv.Total, Currency: string(inv.Currency),
				CreatedAt:        time.Unix(inv.Created, 0).UTC().Format(http.TimeFormat),
				HostedInvoiceURL: inv.HostedInvoiceURL, InvoicePDF: inv.InvoicePDF,
			})
		}
		if err := it.Err(); err != nil {
			log.Printf("stripe: admin list invoices for customer %s: %v", customerID, err)
			writeError(w, http.StatusBadGateway, "could not load invoices")
			return
		}
	}
	writeJSON(w, http.StatusOK, out)
}
