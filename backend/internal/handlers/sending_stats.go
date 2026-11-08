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
	// 14 days per sender domain and address; absent from older scripts.
	History *struct {
		Days    []string `json:"days"`
		Domains map[string]struct {
			Sent      []int `json:"sent"`
			Delivered []int `json:"delivered"`
			Deferred  []int `json:"deferred"`
			Rejected  []int `json:"rejected"`
			Reasons   []struct {
				Text  string `json:"text"`
				Count int    `json:"count"`
			} `json:"reasons"`
		} `json:"domains"`
		Senders map[string][]int `json:"senders"`
	} `json:"history"`
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
	if h := req.History; h != nil {
		for _, day := range h.Days {
			if _, err := time.Parse(time.DateOnly, day); err != nil {
				writeError(w, http.StatusBadRequest, "history days must be YYYY-MM-DD")
				return
			}
		}
		hist := db.SendingHistory{Days: h.Days, Domains: map[string]db.DomainHistory{}, Senders: h.Senders}
		for domain, d := range h.Domains {
			dh := db.DomainHistory{Sent: d.Sent, Delivered: d.Delivered, Deferred: d.Deferred, Rejected: d.Rejected}
			for _, r := range d.Reasons {
				dh.Reasons = append(dh.Reasons, db.SendingReason{Text: r.Text, Count: r.Count})
			}
			hist.Domains[domain] = dh
		}
		if err := a.Store.ReplaceSendingHistory(r.Context(), hist); err != nil {
			log.Printf("sending history: %v", err)
			writeError(w, http.StatusInternalServerError, "could not store sending history")
			return
		}
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

type sendingHistoryResponse struct {
	Days []sendingDayResponse `json:"days"`
	// Most common rejection reasons of the last 7 days, as the receiving servers worded them.
	Reasons []sendingReasonResponse `json:"reasons"`
	// Per mailbox address, messages sent per day, in the same order as days.
	Senders map[string][]int `json:"senders"`
}

type sendingDayResponse struct {
	Day       string `json:"day"`
	Sent      int    `json:"sent"`
	Delivered int    `json:"delivered"`
	Deferred  int    `json:"deferred"`
	Rejected  int    `json:"rejected"`
}

type sendingReasonResponse struct {
	Text  string `json:"text"`
	Count int    `json:"count"`
}

const historyDays = 14

// GetDomainSendingHistory -> GET /api/domains/{id}/sending/history: the
// last 14 days, every day present (zero when nothing was sent).
func (a *App) GetDomainSendingHistory(w http.ResponseWriter, r *http.Request) {
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
	today := time.Now().UTC().Truncate(24 * time.Hour)
	since := today.AddDate(0, 0, -(historyDays - 1))
	days, reasons, senders, err := a.Store.DomainSendingHistory(r.Context(), domain.Name, since)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load sending history")
		return
	}
	byDay := make(map[string]db.SendingDay, len(days))
	for _, d := range days {
		byDay[d.Day.Format(time.DateOnly)] = d
	}
	out := sendingHistoryResponse{Days: make([]sendingDayResponse, 0, historyDays), Reasons: []sendingReasonResponse{}, Senders: map[string][]int{}}
	order := make([]string, 0, historyDays)
	for i := 0; i < historyDays; i++ {
		day := since.AddDate(0, 0, i).Format(time.DateOnly)
		order = append(order, day)
		d := byDay[day]
		out.Days = append(out.Days, sendingDayResponse{Day: day, Sent: d.Sent, Delivered: d.Delivered, Deferred: d.Deferred, Rejected: d.Rejected})
	}
	for _, rr := range reasons {
		out.Reasons = append(out.Reasons, sendingReasonResponse{Text: rr.Text, Count: rr.Count})
	}
	for addr, perDay := range senders {
		series := make([]int, historyDays)
		for i, day := range order {
			series[i] = perDay[day]
		}
		out.Senders[addr] = series
	}
	writeJSON(w, http.StatusOK, out)
}
