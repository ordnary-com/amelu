package handlers

import (
	"errors"
	"net/http"

	"amelu/backend/internal/db"
)

type changelogEntryResponse struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Body        string  `json:"body"`
	Author      string  `json:"author"`
	Published   bool    `json:"published"`
	PublishedAt *string `json:"publishedAt,omitempty"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

func toChangelogEntryResponse(e *db.ChangelogEntry) changelogEntryResponse {
	resp := changelogEntryResponse{
		ID: e.ID, Title: e.Title, Body: e.Body, Author: e.Author,
		Published: e.PublishedAt.Valid,
		CreatedAt: e.CreatedAt.Format(http.TimeFormat),
		UpdatedAt: e.UpdatedAt.Format(http.TimeFormat),
	}
	if e.PublishedAt.Valid {
		formatted := e.PublishedAt.Time.Format(http.TimeFormat)
		resp.PublishedAt = &formatted
	}
	return resp
}

// AdminListChangelog -> GET /internal/admin/changelog
func (a *App) AdminListChangelog(w http.ResponseWriter, r *http.Request, operator string) {
	entries, err := a.Store.ListChangelogEntries(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load changelog")
		return
	}
	out := make([]changelogEntryResponse, 0, len(entries))
	for i := range entries {
		out = append(out, toChangelogEntryResponse(&entries[i]))
	}
	writeJSON(w, http.StatusOK, out)
}

type adminCreateChangelogRequest struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

// AdminCreateChangelog -> POST /internal/admin/changelog. Always created as
// a draft (published=false) - publishing is a separate explicit step via
// AdminUpdateChangelog, same "write then decide to ship" split as most CMS
// tools.
func (a *App) AdminCreateChangelog(w http.ResponseWriter, r *http.Request, operator string) {
	var req adminCreateChangelogRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" || req.Body == "" {
		writeError(w, http.StatusBadRequest, "title and body are required")
		return
	}
	entry, err := a.Store.CreateChangelogEntry(r.Context(), req.Title, req.Body, operator)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create changelog entry")
		return
	}
	a.Store.LogAdminAction(r.Context(), "changelog", entry.ID, operator, "changelog.created", "Created draft \""+entry.Title+"\"")
	writeJSON(w, http.StatusCreated, toChangelogEntryResponse(entry))
}

type adminUpdateChangelogRequest struct {
	Title     *string `json:"title,omitempty"`
	Body      *string `json:"body,omitempty"`
	Published *bool   `json:"published,omitempty"`
}

// AdminUpdateChangelog -> PATCH /internal/admin/changelog/{id}
func (a *App) AdminUpdateChangelog(w http.ResponseWriter, r *http.Request, operator string) {
	var req adminUpdateChangelogRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	entry, err := a.Store.UpdateChangelogEntry(r.Context(), r.PathValue("id"), db.UpdateChangelogEntryInput{
		Title: req.Title, Body: req.Body, Published: req.Published,
	})
	if errors.Is(err, db.ErrNotFound) {
		writeError(w, http.StatusNotFound, "changelog entry not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update changelog entry")
		return
	}
	action := "changelog.updated"
	if req.Published != nil {
		if *req.Published {
			action = "changelog.published"
		} else {
			action = "changelog.unpublished"
		}
	}
	a.Store.LogAdminAction(r.Context(), "changelog", entry.ID, operator, action, "\""+entry.Title+"\"")
	writeJSON(w, http.StatusOK, toChangelogEntryResponse(entry))
}

// AdminDeleteChangelog -> DELETE /internal/admin/changelog/{id}
func (a *App) AdminDeleteChangelog(w http.ResponseWriter, r *http.Request, operator string) {
	if err := a.Store.DeleteChangelogEntry(r.Context(), r.PathValue("id")); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "changelog entry not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not delete changelog entry")
		return
	}
	a.Store.LogAdminAction(r.Context(), "changelog", r.PathValue("id"), operator, "changelog.deleted", "Deleted")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
