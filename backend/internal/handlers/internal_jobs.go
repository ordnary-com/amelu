package handlers

import (
	"log"
	"net/http"
)

// Healthz is public and unauthenticated by design - the edge Worker and
// Cloudflare Tunnel both need something to poll that proves the origin
// process is up without granting access to anything. It touches no
// database or Stalwart call, so it can't itself become a dependency
// bottleneck during an incident.
func (a *App) Healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// RunExpirationSweepJob is the internal, HMAC-authenticated equivalent of
// the in-process ticker in cmd/api/main.go (see EXPIRATION_SWEEP_MODE in
// internal/config). It exists so the sweep can eventually be triggered by
// a Cloudflare Worker Cron Trigger + Workflow instead of an in-process Go
// ticker - see docs/cloudflare/WORKFLOWS.md. Must only be reachable via
// auth.RequireInternal (HMAC shared secret), which itself must only be
// reachable through the private Tunnel hostname, never the public edge
// Worker route table - see docs/cloudflare/TUNNEL.md.
//
// RunExpirationSweep is already idempotent by construction: it re-queries
// ListExpiredMailboxes every call and each mailbox's action (suspend or
// delete) is a no-op against Stalwart/Postgres once already applied, so
// calling this endpoint twice for the same tick is safe - a hard
// requirement for a Queue/Workflow retry model where at-least-once
// delivery is the norm.
func (a *App) RunExpirationSweepJob(w http.ResponseWriter, r *http.Request) {
	log.Printf("internal job: expiration sweep triggered externally")
	a.RunExpirationSweep(r.Context())
	writeJSON(w, http.StatusOK, map[string]string{"status": "completed"})
}
