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
	ActorAvatar string         `json:"actorAvatarUrl,omitempty"`
	Action      string         `json:"action"`
	ObjectType  string         `json:"objectType"`
	ObjectID    string         `json:"objectId,omitempty"`
	ObjectLabel string         `json:"objectLabel,omitempty"`
	Metadata    map[string]any `json:"metadata"`
	CreatedAt   string         `json:"createdAt"`
	// The exact created_at, for ?before=. createdAt is in http.TimeFormat like the rest
	// of the API, which only has whole seconds, so it can't be a precise cursor.
	Cursor string `json:"cursor"`
}

const auditPageSize = 50

// ListOrganizationAudit backs the "Recent activity" view on
// MyOrganizationPage. Every role can call it, but what comes back is
// filtered by authz.VisibleAuditObjectTypes: owner/admin see everything,
// billing sees only billing events, helpdesk/read_only see only
// non-sensitive operational (domain/mailbox) events. Paginated by a
// created_at cursor - pass the cursor of the last entry received as
// ?before= to fetch the next page. A createdAt (http.TimeFormat) is accepted
// too, for clients that send that back, but it is only exact to the second.
func (a *App) ListOrganizationAudit(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}

	var before time.Time
	if raw := r.URL.Query().Get("before"); raw != "" {
		parsed, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			parsed, err = http.ParseTime(raw)
		}
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
			ActorAvatar: e.ActorAvatarURL.String,
			Action:      e.Action,
			ObjectType:  e.ObjectType,
			ObjectID:    e.ObjectID.String,
			ObjectLabel: e.ObjectLabel.String,
			Metadata:    metadata,
			CreatedAt:   e.CreatedAt.Format(http.TimeFormat),
			Cursor:      e.CreatedAt.UTC().Format(time.RFC3339Nano),
		})
	}
	writeJSON(w, http.StatusOK, out)
}
