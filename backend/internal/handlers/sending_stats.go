package handlers

import (
	"errors"
	"log"
	"net/http"
	"time"

	"amelu/backend/internal/db"
)

// Sending stats: how much each domain sent over the last 24 hours, against
// its plan's daily limit (sending_limits.go). Stalwart doesn't expose its
// throttle counters, so ops/marduk/amelu-sending-stats.py counts messages
// per sender domain from Stalwart's log every 15 minutes and posts them here.

type sendingStatsReport struct {
	// Sender domain -> messages sent in the last 24 hours.
	Domains map[string]int `json:"domains"`
}

// SendingStatsJob -> POST /internal/jobs/sending-stats (auth.RequireInternal
// with SENDING_STATS_SECRET). Each report replaces the previous one.
func (a *App) SendingStatsJob(w http.ResponseWriter, r *http.Request) {
	var req sendingStatsReport
	if err := decodeJSON(r, &req); err != nil || req.Domains == nil {
		writeError(w, http.StatusBadRequest, "domains is required")
		return
	}
	for domain, n := range req.Domains {
		if domain == "" || n < 0 {
			writeError(w, http.StatusBadRequest, "invalid domain count")
			return
		}
	}
	if err := a.Store.ReplaceSendingStats(r.Context(), req.Domains, time.Now()); err != nil {
		log.Printf("sending stats: %v", err)
		writeError(w, http.StatusInternalServerError, "could not store sending stats")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "stored", "domains": len(req.Domains)})
}

type domainSendingResponse struct {
	// Messages sent from this domain over the last 24 hours.
	Sent int `json:"sent"`
	// The plan's daily limit per sender domain. Over it, mail waits in the queue.
	Limit int `json:"limit"`
	// When the count was taken; null while no report has come in yet.
	UpdatedAt *time.Time `json:"updatedAt"`
}

// GetDomainSending -> GET /api/domains/{id}/sending
func (a *App) GetDomainSending(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, err := a.Store.GetDomainForOrganization(r.Context(), customer.OrganizationID.String, r.PathValue("id"))
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "domain not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load domain")
		return
	}
	tier, err := a.Store.GetOrganizationPlanTierID(r.Context(), customer.OrganizationID.String)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load plan")
		return
	}
	limit, err := a.Store.GetOutgoingLimit(r.Context(), tier)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load plan")
		return
	}
	sent, at, err := a.Store.GetSendingStat(r.Context(), domain.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load sending stats")
		return
	}
	out := domainSendingResponse{Sent: sent, Limit: limit}
	if !at.IsZero() {
		out.UpdatedAt = &at
	}
	writeJSON(w, http.StatusOK, out)
}
