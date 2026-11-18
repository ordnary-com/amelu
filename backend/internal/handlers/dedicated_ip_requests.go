package handlers

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"

	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/checkout/session"
)

// Dedicated IP requests: a support ticket of its own kind (category
// dedicated_ip), opened from My Organization > Dedicated IPs with the
// customer's answers. Staff approve or decline it in Airplane, the customer
// pays EUR 10 a month through Stripe Checkout (a subscription of its own,
// next to the plan's), and assigning an address finishes it. Every step
// leaves a system message in the conversation. See migration 0051.

const dedicatedIPPriceCents = 1000

var (
	dedicatedIPVolumes = map[string]string{
		"lt10k":    "fewer than 10,000 messages",
		"10k-100k": "10,000 to 100,000 messages",
		"100k-1m":  "100,000 to 1 million messages",
		"gt1m":     "more than 1 million messages",
	}
	dedicatedIPUseCases = map[string]string{
		"transactional": "transactional mail (receipts, notifications, password resets)",
		"marketing":     "newsletters and marketing",
		"both":          "transactional mail and newsletters",
	}
)

const (
	dedicatedIPReceived = "We've received your request for a dedicated IP. Our team checks it and replies here, usually within one business day. Once it's approved you can activate it for €10 a month."
	dedicatedIPApproved = "Your request is approved. Activate your dedicated IP for €10 a month with the button on this page; we assign an address as soon as the payment is in."
	dedicatedIPDeclined = "We can't offer a dedicated IP for this request right now. Our team explains why in this conversation."
	dedicatedIPPaid     = "Payment received: your dedicated IP is €10 a month. We're assigning an address now."
	dedicatedIPEnded    = "Your dedicated IP subscription has ended. Your mail goes back to Amelu's shared addresses."
)

func dedicatedIPAssigned(ip string) string {
	return fmt.Sprintf("Dedicated IP %s is now yours. Mail from your domains goes out from it once its setup finishes, usually within the hour. You can follow it under My Organization, Dedicated IPs.", ip)
}

type dedicatedIPRequestResponse struct {
	ID        string  `json:"id"`
	TicketID  string  `json:"ticketId"`
	Status    string  `json:"status"`
	Volume    string  `json:"volume"`
	UseCase   string  `json:"useCase"`
	Domains   string  `json:"domains"`
	IP        *string `json:"ip"`
	CreatedAt string  `json:"createdAt"`
}

func toDedicatedIPRequestResponse(d *db.DedicatedIPRequest) *dedicatedIPRequestResponse {
	resp := &dedicatedIPRequestResponse{
		ID: d.ID, TicketID: d.TicketID, Status: d.Status, Volume: d.Volume, UseCase: d.UseCase, Domains: d.Domains,
		CreatedAt: d.CreatedAt.UTC().Format(time.RFC3339),
	}
	if d.IP.Valid {
		resp.IP = &d.IP.String
	}
	return resp
}

type createDedicatedIPRequest struct {
	Volume  string `json:"volume"`
	UseCase string `json:"useCase"`
	Domains string `json:"domains"`
	Message string `json:"message"`
}

// CreateDedicatedIPRequest -> POST /api/organization/dedicated-ips/requests:
// opens the request's ticket. Owners and admins only (it leads to a charge).
func (a *App) CreateDedicatedIPRequest(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageBilling(role) {
		writeError(w, http.StatusForbidden, "only owners and admins can request a dedicated IP")
		return
	}
	var req createDedicatedIPRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	volume, ok1 := dedicatedIPVolumes[req.Volume]
	useCase, ok2 := dedicatedIPUseCases[req.UseCase]
	if !ok1 || !ok2 {
		writeError(w, http.StatusBadRequest, "choose your monthly volume and what you send")
		return
	}
	domains := strings.TrimSpace(req.Domains)
	message := strings.TrimSpace(req.Message)
	if len(domains) > 500 || len(message) > supportBodyMax {
		writeError(w, http.StatusBadRequest, "your message is too long")
		return
	}
	// The ticket's first message: the answers, then whatever they added.
	var body strings.Builder
	body.WriteString("We'd like a dedicated IP for our organization.\n\n")
	fmt.Fprintf(&body, "Monthly volume: %s\nWhat we send: %s\n", volume, useCase)
	if domains != "" {
		fmt.Fprintf(&body, "Domains: %s\n", domains)
	}
	if message != "" {
		body.WriteString("\n" + message)
	}
	orgID := customer.OrganizationID.String
	d, err := a.Store.CreateDedicatedIPRequest(r.Context(), orgID, customer.ID, supportAuthorName(customer),
		"Dedicated IP request", strings.TrimSpace(body.String()), dedicatedIPReceived, req.Volume, req.UseCase, domains)
	if errors.Is(err, db.ErrDedicatedIPRequestOpen) {
		writeError(w, http.StatusConflict, "your organization already has an open dedicated IP request")
		return
	} else if err != nil {
		log.Printf("dedicated ip: create request: %v", err)
		writeError(w, http.StatusInternalServerError, "could not send the request")
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), orgID, &customer.ID, customer.Email,
		"dedicated_ip.requested", "support_ticket", d.TicketID, "Dedicated IP request", nil, requestIP(r))
	if t, err := a.Store.GetSupportTicket(r.Context(), d.TicketID); err == nil {
		a.notifySupport(t, "Dedicated IP request", body.String())
	}
	writeJSON(w, http.StatusCreated, toDedicatedIPRequestResponse(d))
}

// GetOpenDedicatedIPRequest -> GET /api/organization/dedicated-ips/requests/open:
// the request that hasn't ended yet, or null.
func (a *App) GetOpenDedicatedIPRequest(w http.ResponseWriter, r *http.Request) {
	customer, _, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	d, err := a.Store.GetOpenDedicatedIPRequest(r.Context(), customer.OrganizationID.String)
	if errors.Is(err, db.ErrNotFound) {
		writeJSON(w, http.StatusOK, nil)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load the request")
		return
	}
	writeJSON(w, http.StatusOK, toDedicatedIPRequestResponse(d))
}

// DedicatedIPCheckout -> POST /api/organization/dedicated-ips/requests/{id}/checkout:
// Stripe Checkout for the EUR 10 a month subscription, once staff approved it.
func (a *App) DedicatedIPCheckout(w http.ResponseWriter, r *http.Request) {
	if !a.StripeEnabled {
		writeError(w, http.StatusServiceUnavailable, "billing is not available yet")
		return
	}
	actor, billingCustomer, ok := a.resolveBillingCustomer(w, r, true)
	if !ok {
		return
	}
	id := r.PathValue("id")
	d, err := a.Store.GetDedicatedIPRequest(r.Context(), id)
	if !uuidPattern.MatchString(id) || errors.Is(err, db.ErrNotFound) || (err == nil && d.OrganizationID != actor.OrganizationID.String) {
		writeError(w, http.StatusNotFound, "request not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load the request")
		return
	}
	if d.Status != "approved" {
		writeError(w, http.StatusConflict, "this request can't be paid for (yet)")
		return
	}
	stripeCustomerID, ok := a.getOrCreateStripeCustomer(w, r, billingCustomer)
	if !ok {
		return
	}
	params := &stripe.CheckoutSessionParams{
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		Customer: stripe.String(stripeCustomerID),
		LineItems: []*stripe.CheckoutSessionLineItemParams{{
			Quantity: stripe.Int64(1),
			PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
				Currency:    stripe.String("eur"),
				UnitAmount:  stripe.Int64(dedicatedIPPriceCents),
				Recurring:   &stripe.CheckoutSessionLineItemPriceDataRecurringParams{Interval: stripe.String("month")},
				ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{Name: stripe.String("Amelu dedicated IP")},
			},
		}},
		SuccessURL: stripe.String(a.FrontendOrigin + "/support/tickets/" + d.TicketID + "?paid=1"),
		CancelURL:  stripe.String(a.FrontendOrigin + "/support/tickets/" + d.TicketID),
		TaxIDCollection: &stripe.CheckoutSessionTaxIDCollectionParams{
			Enabled:  stripe.Bool(true),
			Required: stripe.String("never"),
		},
		CustomerUpdate: &stripe.CheckoutSessionCustomerUpdateParams{
			Name:    stripe.String("auto"),
			Address: stripe.String("auto"),
		},
	}
	params.AddExtra("branding_settings[display_name]", "Amelu Internet Services")
	// kind tells the webhook this subscription is a dedicated IP, not the
	// organization's plan, so it never touches the plan.
	params.SubscriptionData = &stripe.CheckoutSessionSubscriptionDataParams{}
	for _, m := range []interface{ AddMetadata(string, string) }{params, params.SubscriptionData} {
		m.AddMetadata("kind", "dedicated_ip")
		m.AddMetadata("requestId", d.ID)
		m.AddMetadata("customerId", billingCustomer.ID)
	}
	s, err := session.New(params)
	if err != nil {
		log.Printf("stripe: dedicated ip checkout: %v", err)
		writeStripeError(w, "could not start checkout", err)
		return
	}
	a.Store.LogOrganizationAudit(r.Context(), actor.OrganizationID.String, &actor.ID, actor.Email,
		"dedicated_ip.checkout_started", "dedicated_ip_request", d.ID, "Dedicated IP", nil, requestIP(r))
	writeJSON(w, http.StatusOK, map[string]string{"url": s.URL})
}

type adminDedicatedIPRequestAction struct {
	// approve or decline
	Action string `json:"action"`
}

// AdminDedicatedIPRequestAction -> POST /internal/admin/support/tickets/{id}/dedicated-ip:
// approves (the customer can then pay) or declines the ticket's request.
func (a *App) AdminDedicatedIPRequestAction(w http.ResponseWriter, r *http.Request, operator string) {
	t, ok := a.adminLoadSupportTicket(w, r)
	if !ok {
		return
	}
	var req adminDedicatedIPRequestAction
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	d, err := a.Store.GetDedicatedIPRequestByTicket(r.Context(), t.ID)
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "this ticket isn't a dedicated IP request")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load the request")
		return
	}
	var status, message string
	switch req.Action {
	case "approve":
		status, message = "approved", dedicatedIPApproved
	case "decline":
		status, message = "declined", dedicatedIPDeclined
	default:
		writeError(w, http.StatusBadRequest, "action must be approve or decline")
		return
	}
	changed, err := a.Store.AdvanceDedicatedIPRequest(r.Context(), d.ID, []string{"requested"}, status, nil, nil, message, "answered")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update the request")
		return
	}
	if !changed {
		writeError(w, http.StatusConflict, "the request was already "+d.Status)
		return
	}
	a.Store.LogAdminAction(r.Context(), "dedicated_ip_request", d.ID, operator, "dedicated_ip_request."+status, fmt.Sprintf("#%d", t.Number))
	a.notifyCustomerOfReply(t, message, false)
	d, _ = a.Store.GetDedicatedIPRequest(r.Context(), d.ID)
	writeJSON(w, http.StatusOK, toDedicatedIPRequestResponse(d))
}

// finishDedicatedIPRequest marks a paid request active once staff assign an
// address to its organization.
func (a *App) finishDedicatedIPRequest(r *http.Request, organizationID, ip string) {
	d, err := a.Store.GetOpenDedicatedIPRequest(r.Context(), organizationID)
	if err != nil || d.Status != "paid" {
		return
	}
	message := dedicatedIPAssigned(ip)
	if changed, err := a.Store.AdvanceDedicatedIPRequest(r.Context(), d.ID, []string{"paid"}, "active", nil, &ip, message, "answered"); err != nil {
		log.Printf("dedicated ip: finish request %s: %v", d.ID, err)
	} else if changed {
		if t, err := a.Store.GetSupportTicket(r.Context(), d.TicketID); err == nil {
			a.notifyCustomerOfReply(t, message, false)
		}
	}
}

// dedicatedIPPaid handles a finished Checkout for a dedicated IP (webhook).
func (a *App) dedicatedIPPaidWebhook(r *http.Request, requestID, subscriptionID string) {
	d, err := a.Store.GetDedicatedIPRequest(r.Context(), requestID)
	if err != nil {
		log.Printf("stripe webhook: dedicated ip request %s: %v", requestID, err)
		return
	}
	changed, err := a.Store.AdvanceDedicatedIPRequest(r.Context(), d.ID, []string{"approved"}, "paid", &subscriptionID, nil, dedicatedIPPaid, "open")
	if err != nil {
		log.Printf("stripe webhook: mark dedicated ip request %s paid: %v", d.ID, err)
		return
	}
	if changed {
		if t, err := a.Store.GetSupportTicket(r.Context(), d.TicketID); err == nil {
			a.notifySupport(t, "Dedicated IP paid", dedicatedIPPaid)
		}
	}
}

// dedicatedIPEndedWebhook ends a request whose subscription was cancelled,
// and releases its address so the organization's mail goes back to the
// shared ones.
func (a *App) dedicatedIPEndedWebhook(r *http.Request, subscriptionID string) {
	d, err := a.Store.GetDedicatedIPRequestBySubscription(r.Context(), subscriptionID)
	if err != nil {
		return
	}
	changed, err := a.Store.AdvanceDedicatedIPRequest(r.Context(), d.ID, []string{"paid", "active"}, "cancelled", nil, nil, dedicatedIPEnded, "closed")
	if err != nil || !changed {
		return
	}
	if d.IP.Valid {
		if err := a.Store.AssignDedicatedIP(r.Context(), d.IP.String, nil); err != nil {
			log.Printf("stripe webhook: release dedicated ip %s: %v", d.IP.String, err)
		}
	}
	if t, err := a.Store.GetSupportTicket(r.Context(), d.TicketID); err == nil {
		a.notifySupport(t, "Dedicated IP ended", dedicatedIPEnded)
	}
}
