package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"amelu/backend/internal/authz"
)

type auditEntryResponse struct {
	ID          string         `json:"id"`
	ActorEmail  string         `json:"actorEmail"`
	Action      string         `json:"action"`
	ObjectType  string         `json:"objectType"`
	ObjectID    string         `json:"objectId,omitempty"`
	ObjectLabel string         `json:"objectLabel,omitempty"`
	Metadata    map[string]any `json:"metadata"`
	CreatedAt   string         `json:"createdAt"`
}

const auditPageSize = 50

// ListOrganizationAudit backs the "Recent activity" view on
// MyOrganizationPage. Every role can call it, but what comes back is
// filtered by authz.VisibleAuditObjectTypes: owner/admin see everything,
// billing sees only billing events, helpdesk/read_only see only
// non-sensitive operational (domain/mailbox) events. Paginated by a
// created_at cursor - pass the createdAt of the last entry received as
// ?before= to fetch the next page.
func (a *App) ListOrganizationAudit(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}

	var before time.Time
	if raw := r.URL.Query().Get("before"); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "before must be an RFC3339 timestamp")
			return
		}
		before = parsed
	}

	limit := auditPageSize
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	entries, err := a.Store.ListOrganizationAudit(r.Context(), customer.OrganizationID.String, authz.VisibleAuditObjectTypes(role), before, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list activity")
		return
	}

	out := make([]auditEntryResponse, 0, len(entries))
	for _, e := range entries {
		metadata := map[string]any{}
		if len(e.Metadata) > 0 {
			json.Unmarshal(e.Metadata, &metadata)
		}
		out = append(out, auditEntryResponse{
			ID:          e.ID,
			ActorEmail:  e.ActorEmail,
			Action:      e.Action,
			ObjectType:  e.ObjectType,
			ObjectID:    e.ObjectID.String,
			ObjectLabel: e.ObjectLabel.String,
			Metadata:    metadata,
			CreatedAt:   e.CreatedAt.Format(http.TimeFormat),
		})
	}
	writeJSON(w, http.StatusOK, out)
}
