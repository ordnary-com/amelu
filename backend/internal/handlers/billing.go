package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"

	"github.com/stripe/stripe-go/v81"
	portalsession "github.com/stripe/stripe-go/v81/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/customer"
	"github.com/stripe/stripe-go/v81/invoice"
	"github.com/stripe/stripe-go/v81/webhook"
)

// resolveBillingCustomer authenticates the acting customer, checks the
// requested billing permission, and resolves the *billing-holding* customer
// row for their organization - plan_tier_id/stripe_customer_id are still
// per-customer columns (billing hasn't been made organization-aware, out of
// scope for this change - see db.GetOrganizationOwnerCustomer), so every
// team member with billing access sees/manages the organization owner's
// billing state, not their own (usually plan-less) row. Returns the acting
// customer (for audit logging) and the billing-holder customer.
func (a *App) resolveBillingCustomer(w http.ResponseWriter, r *http.Request, requireManage bool) (actor *db.Customer, billingCustomer *db.Customer, ok bool) {
	actor, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return nil, nil, false
	}
	allowed := authz.CanViewBilling(role)
	if requireManage {
		allowed = authz.CanManageBilling(role)
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you don't have permission to access billing")
		return nil, nil, false
	}
	billingCustomer, err := a.Store.GetOrganizationOwnerCustomer(r.Context(), actor.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load billing account")
		return nil, nil, false
	}
	return actor, billingCustomer, true
}

type planResponse struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	PriceCentsMonthly     *int64 `json:"priceCentsMonthly,omitempty"`
	PriceCentsAnnual      *int64 `json:"priceCentsAnnual,omitempty"`
	MaxDomains            int    `json:"maxDomains"`
	MaxMailboxesPerDomain int    `json:"maxMailboxesPerDomain"`
	Purchasable           bool   `json:"purchasable"`
	Current               bool   `json:"current"`
}

func toPlanResponse(p *db.PlanTier, currentPlanID string) planResponse {
	resp := planResponse{
		ID:                    p.ID,
		Name:                  p.Name,
		MaxDomains:            p.MaxDomains,
		MaxMailboxesPerDomain: p.MaxMailboxesPerDomain,
		Purchasable:           p.BillingProvider.String == "stripe" && p.StripePriceIDMonthly.Valid && p.StripePriceIDAnnual.Valid,
		Current:               p.ID == currentPlanID,
	}
	if p.PriceCentsMonthly.Valid {
		resp.PriceCentsMonthly = &p.PriceCentsMonthly.Int64
	}
	if p.PriceCentsAnnual.Valid {
		resp.PriceCentsAnnual = &p.PriceCentsAnnual.Int64
	}
	return resp
}

func (a *App) ListPlans(w http.ResponseWriter, r *http.Request) {
	_, cust, ok := a.resolveBillingCustomer(w, r, false)
	if !ok {
		return
	}

	plans, err := a.Store.ListPlanTiers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list plans")
		return
	}

	out := make([]planResponse, 0, len(plans))
	for i := range plans {
		out = append(out, toPlanResponse(&plans[i], cust.PlanTierID))
	}
	writeJSON(w, http.StatusOK, out)
}

type billingOverviewResponse struct {
	Plan               planResponse `json:"plan"`
	SubscriptionStatus string       `json:"subscriptionStatus,omitempty"`
	BillingInterval    string       `json:"billingInterval,omitempty"`
	HasPaymentMethod   bool         `json:"hasPaymentMethod"`
}

func (a *App) GetBillingOverview(w http.ResponseWriter, r *http.Request) {
	_, cust, ok := a.resolveBillingCustomer(w, r, false)
	if !ok {
		return
	}

	billing, err := a.Store.GetCustomerBilling(r.Context(), cust.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load billing info")
		return
	}
	plan, err := a.Store.GetPlanTierByID(r.Context(), billing.PlanTierID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load plan")
		return
	}

	writeJSON(w, http.StatusOK, billingOverviewResponse{
		Plan:               toPlanResponse(plan, cust.PlanTierID),
		SubscriptionStatus: billing.SubscriptionStatus.String,
		BillingInterval:    billing.BillingInterval.String,
		HasPaymentMethod:   billing.StripeCustomerID.Valid,
	})
}

type invoiceResponse struct {
	ID               string `json:"id"`
	Number           string `json:"number"`
	Status           string `json:"status"`
	Total            int64  `json:"total"`
	Currency         string `json:"currency"`
	CreatedAt        string `json:"createdAt"`
	HostedInvoiceURL string `json:"hostedInvoiceUrl,omitempty"`
	InvoicePDF       string `json:"invoicePdf,omitempty"`
}

// ListInvoices returns every Stripe invoice issued to this customer, newest
// first (Stripe's own default List ordering) - there's no local copy of
// invoices, this reads straight from Stripe on each request.
func (a *App) ListInvoices(w http.ResponseWriter, r *http.Request) {
	if !a.StripeEnabled {
		writeError(w, http.StatusServiceUnavailable, "billing is not available yet")
		return
	}
	_, cust, ok := a.resolveBillingCustomer(w, r, false)
	if !ok {
		return
	}

	billing, err := a.Store.GetCustomerBilling(r.Context(), cust.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load billing info")
		return
	}

	out := []invoiceResponse{}
	if billing.StripeCustomerID.Valid && billing.StripeCustomerID.String != "" {
		params := &stripe.InvoiceListParams{
			Customer: stripe.String(billing.StripeCustomerID.String),
		}
		params.Limit = stripe.Int64(100)
		it := invoice.List(params)
		for it.Next() {
			inv := it.Invoice()
			out = append(out, invoiceResponse{
				ID:               inv.ID,
				Number:           inv.Number,
				Status:           string(inv.Status),
				Total:            inv.Total,
				Currency:         string(inv.Currency),
				CreatedAt:        time.Unix(inv.Created, 0).UTC().Format(http.TimeFormat),
				HostedInvoiceURL: inv.HostedInvoiceURL,
				InvoicePDF:       inv.InvoicePDF,
			})
		}
		if err := it.Err(); err != nil {
			log.Printf("stripe: list invoices for customer %s: %v", cust.ID, err)
			writeError(w, http.StatusBadGateway, "could not load invoices")
			return
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// getOrCreateStripeCustomer returns the customer's existing Stripe Customer
// ID, creating one on first use - a customer doesn't get a Stripe Customer
// object until they actually start a checkout.
func (a *App) getOrCreateStripeCustomer(w http.ResponseWriter, r *http.Request, cust *db.Customer) (string, bool) {
	billing, err := a.Store.GetCustomerBilling(r.Context(), cust.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load billing info")
		return "", false
	}
	if billing.StripeCustomerID.Valid && billing.StripeCustomerID.String != "" {
		return billing.StripeCustomerID.String, true
	}

	params := &stripe.CustomerParams{
		Email: stripe.String(cust.Email),
		Name:  stripe.String(cust.Name),
	}
	params.AddMetadata("customerId", cust.ID)
	sc, err := customer.New(params)
	if err != nil {
		log.Printf("stripe: create customer: %v", err)
		writeError(w, http.StatusBadGateway, "could not create Stripe customer")
		return "", false
	}

	if err := a.Store.SetCustomerStripeCustomerID(r.Context(), cust.ID, sc.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save Stripe customer")
		return "", false
	}
	return sc.ID, true
}

type createCheckoutSessionRequest struct {
	PlanID string `json:"planId"`
	// Interval is "monthly" or "annual" (the default, and the cheaper
	// effective rate) - see plan_tiers.price_cents_annual/monthly.
	Interval string `json:"interval"`
}

func (a *App) CreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	if !a.StripeEnabled {
		writeError(w, http.StatusServiceUnavailable, "billing is not available yet")
		return
	}
	actor, cust, ok := a.resolveBillingCustomer(w, r, true)
	if !ok {
		return
	}

	var req createCheckoutSessionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Interval == "" {
		req.Interval = "annual"
	}
	if req.Interval != "annual" && req.Interval != "monthly" {
		writeError(w, http.StatusBadRequest, "interval must be \"monthly\" or \"annual\"")
		return
	}

	plan, err := a.Store.GetPlanTierByID(r.Context(), req.PlanID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no such plan")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load plan")
		return
	}
	if plan.BillingProvider.String != "stripe" || !plan.StripePriceIDMonthly.Valid || !plan.StripePriceIDAnnual.Valid {
		writeError(w, http.StatusBadRequest, "this plan is not available for purchase")
		return
	}
	stripePriceID := plan.StripePriceIDAnnual.String
	if req.Interval == "monthly" {
		stripePriceID = plan.StripePriceIDMonthly.String
	}

	stripeCustomerID, ok := a.getOrCreateStripeCustomer(w, r, cust)
	if !ok {
		return
	}

	params := &stripe.CheckoutSessionParams{
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		Customer: stripe.String(stripeCustomerID),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{Price: stripe.String(stripePriceID), Quantity: stripe.Int64(1)},
		},
		SuccessURL: stripe.String(a.FrontendOrigin + "/billing/overview?checkout=success"),
		CancelURL:  stripe.String(a.FrontendOrigin + "/billing/plans?checkout=cancelled"),
	}
	params.AddMetadata("customerId", cust.ID)
	params.AddMetadata("planTierId", plan.ID)
	params.AddMetadata("interval", req.Interval)
	// stripe-go v81 doesn't have a typed field for this yet - branding_settings
	// is newer than the SDK's struct coverage - so it goes through AddExtra.
	// Only overrides the name shown at the top of the Checkout page itself;
	// receipts/invoices/terms still use the account's actual business name.
	params.AddExtra("branding_settings[display_name]", "Amelu Internet Services")
	params.SubscriptionData = &stripe.CheckoutSessionSubscriptionDataParams{}
	params.SubscriptionData.AddMetadata("customerId", cust.ID)
	params.SubscriptionData.AddMetadata("planTierId", plan.ID)
	params.SubscriptionData.AddMetadata("interval", req.Interval)

	session, err := checkoutsession.New(params)
	if err != nil {
		log.Printf("stripe: create checkout session: %v", err)
		writeError(w, http.StatusBadGateway, "could not start checkout")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), actor.OrganizationID.String, &actor.ID, actor.Email,
		"billing.checkout_started", "billing", plan.ID, plan.Name, map[string]any{"interval": req.Interval}, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]string{"url": session.URL})
}

type createBillingPortalSessionRequest struct {
	// Flow selects a Stripe Billing Portal deep-link flow (eg.
	// "payment_method_update") instead of the portal's default landing
	// page. See https://stripe.com/docs/customer-management/portal-deep-links.
	Flow string `json:"flow"`
}

func (a *App) CreateBillingPortalSession(w http.ResponseWriter, r *http.Request) {
	if !a.StripeEnabled {
		writeError(w, http.StatusServiceUnavailable, "billing is not available yet")
		return
	}
	actor, cust, ok := a.resolveBillingCustomer(w, r, true)
	if !ok {
		return
	}

	billing, err := a.Store.GetCustomerBilling(r.Context(), cust.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load billing info")
		return
	}
	if !billing.StripeCustomerID.Valid || billing.StripeCustomerID.String == "" {
		writeError(w, http.StatusBadRequest, "start a checkout before managing billing")
		return
	}

	var req createBillingPortalSessionRequest
	if r.ContentLength != 0 {
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(billing.StripeCustomerID.String),
		ReturnURL: stripe.String(a.FrontendOrigin + "/billing/overview"),
	}
	if req.Flow != "" {
		params.FlowData = &stripe.BillingPortalSessionFlowDataParams{
			Type: stripe.String(req.Flow),
		}
		if req.Flow == string(stripe.BillingPortalSessionFlowTypeSubscriptionCancel) {
			if !billing.StripeSubscriptionID.Valid || billing.StripeSubscriptionID.String == "" {
				writeError(w, http.StatusBadRequest, "no active subscription to cancel")
				return
			}
			params.FlowData.SubscriptionCancel = &stripe.BillingPortalSessionFlowDataSubscriptionCancelParams{
				Subscription: stripe.String(billing.StripeSubscriptionID.String),
			}
		}
	}

	session, err := portalsession.New(params)
	if err != nil {
		log.Printf("stripe: create billing portal session: %v", err)
		writeError(w, http.StatusBadGateway, "could not open billing portal")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), actor.OrganizationID.String, &actor.ID, actor.Email,
		"billing.portal_opened", "billing", "", "", map[string]any{"flow": req.Flow}, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]string{"url": session.URL})
}

// StripeWebhook receives account-wide subscription lifecycle events. It is
// intentionally unauthenticated (Stripe, not a logged-in customer, calls
// this) - the webhook signature is the only trust boundary here.
func (a *App) StripeWebhook(w http.ResponseWriter, r *http.Request) {
	if !a.StripeEnabled || a.StripeWebhookSecret == "" {
		writeError(w, http.StatusServiceUnavailable, "billing is not available yet")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64*1024))
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read request body")
		return
	}

	// IgnoreAPIVersionMismatch: the Stripe account's pinned API version can
	// legitimately differ from the version this stripe-go release expects -
	// the event shapes we actually read (ids, customer, subscription,
	// metadata, status, price) are stable across versions, so this isn't a
	// real reason to reject a genuine, signature-valid webhook.
	event, err := webhook.ConstructEventWithOptions(body, r.Header.Get("Stripe-Signature"), a.StripeWebhookSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
	})
	if err != nil {
		log.Printf("stripe webhook: signature verification failed: %v", err)
		writeError(w, http.StatusBadRequest, "invalid webhook signature")
		return
	}

	ctx := r.Context()
	switch event.Type {
	case stripe.EventTypeCheckoutSessionCompleted:
		var session stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
			log.Printf("stripe webhook: decode checkout session: %v", err)
			break
		}
		if session.Mode != stripe.CheckoutSessionModeSubscription || session.Customer == nil || session.Subscription == nil {
			break
		}
		customerID := session.Metadata["customerId"]
		planTierID := session.Metadata["planTierId"]
		if customerID == "" || planTierID == "" {
			log.Printf("stripe webhook: checkout session %s missing customerId/planTierId metadata", session.ID)
			break
		}
		billingInterval := session.Metadata["interval"]
		if billingInterval != "monthly" && billingInterval != "annual" {
			billingInterval = "annual"
		}
		if err := a.Store.UpdateCustomerSubscriptionByCustomerID(ctx, customerID, planTierID, billingInterval, session.Customer.ID, session.Subscription.ID, "active"); err != nil {
			log.Printf("stripe webhook: update subscription for customer %s: %v", customerID, err)
		} else if billed, err := a.Store.GetCustomerByID(ctx, customerID); err == nil && billed.OrganizationID.Valid {
			a.Store.LogOrganizationAudit(ctx, billed.OrganizationID.String, nil, "stripe",
				"billing.subscription_started", "billing", planTierID, planTierID, map[string]any{"interval": billingInterval}, "")
		}

	case stripe.EventTypeCustomerSubscriptionUpdated:
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			log.Printf("stripe webhook: decode subscription: %v", err)
			break
		}
		if sub.Customer == nil {
			break
		}
		planTierID := ""
		billingInterval := ""
		if sub.Items != nil && len(sub.Items.Data) > 0 && sub.Items.Data[0].Price != nil {
			priceID := sub.Items.Data[0].Price.ID
			if plan, err := a.Store.GetPlanTierByStripePriceID(ctx, priceID); err == nil {
				planTierID = plan.ID
				if plan.StripePriceIDMonthly.String == priceID {
					billingInterval = "monthly"
				} else if plan.StripePriceIDAnnual.String == priceID {
					billingInterval = "annual"
				}
			}
		}

		var updateErr error
		if planTierID != "" {
			updateErr = a.Store.UpdateCustomerSubscriptionByStripeCustomerID(ctx, sub.Customer.ID, planTierID, billingInterval, sub.ID, string(sub.Status))
		} else {
			// Unknown price (or lookup failed) - keep the customer's current
			// plan assignment and only refresh status/subscription id.
			updateErr = a.Store.UpdateCustomerSubscriptionStatusByStripeCustomerID(ctx, sub.Customer.ID, sub.ID, string(sub.Status))
		}
		if updateErr != nil {
			log.Printf("stripe webhook: update subscription for stripe customer %s: %v", sub.Customer.ID, updateErr)
		} else if billed, err := a.Store.GetCustomerByStripeCustomerID(ctx, sub.Customer.ID); err == nil && billed.OrganizationID.Valid {
			a.Store.LogOrganizationAudit(ctx, billed.OrganizationID.String, nil, "stripe",
				"billing.subscription_updated", "billing", planTierID, planTierID, map[string]any{"status": string(sub.Status)}, "")
		}

	case stripe.EventTypeCustomerSubscriptionDeleted:
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			log.Printf("stripe webhook: decode subscription: %v", err)
			break
		}
		if sub.Customer == nil {
			break
		}
		if err := a.Store.DowngradeCustomerToFreeByStripeCustomerID(ctx, sub.Customer.ID); err != nil {
			log.Printf("stripe webhook: downgrade stripe customer %s: %v", sub.Customer.ID, err)
		} else if billed, err := a.Store.GetCustomerByStripeCustomerID(ctx, sub.Customer.ID); err == nil && billed.OrganizationID.Valid {
			a.Store.LogOrganizationAudit(ctx, billed.OrganizationID.String, nil, "stripe",
				"billing.subscription_cancelled", "billing", "", "", nil, "")
		}
	}

	writeJSON(w, http.StatusOK, map[string]bool{"received": true})
}
