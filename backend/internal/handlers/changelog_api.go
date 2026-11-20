package handlers

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"amelu/backend/internal/db"
)

// The changelog API: Amelu's own changelog entries (table changelog_entries),
// written with a bearer token instead of a session so a tool (Claude, a
// script) can post and edit entries. Published entries show on the
// dashboard's What's new page through GET /api/changelog. See "Changelog
// API" in CLAUDE.md.

// RequireChangelogToken checks "Authorization: Bearer <token>". An empty
// token disables the routes rather than accepting anything.
func RequireChangelogToken(token string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if token == "" {
			writeError(w, http.StatusServiceUnavailable, "the changelog API is not configured")
			return
		}
		got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r)
	}
}

const changelogAPIAuthor = "changelog-api"

// ListChangelogEntries -> GET /api/changelog/entries: every entry, drafts
// included, newest first.
func (a *App) ListChangelogEntries(w http.ResponseWriter, r *http.Request) {
	entries, err := a.Store.ListChangelogEntries(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load changelog")
		return
	}
	out := make([]changelogEntryResponse, 0, len(entries))
	for i := range entries {
		out = append(out, toChangelogEntryResponse(&entries[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": out})
}

type createChangelogEntryRequest struct {
	Title     string `json:"title"`
	Body      string `json:"body"`
	Published bool   `json:"published"`
	// Date (YYYY-MM-DD) publishes the entry with that date instead of today.
	Date string `json:"date"`
}

// parseChangelogDate reads an optional YYYY-MM-DD; noon UTC keeps the day the
// same in every timezone the dashboard formats it in.
func parseChangelogDate(value string) (time.Time, bool, error) {
	if value == "" {
		return time.Time{}, false, nil
	}
	day, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, false, err
	}
	return day.Add(12 * time.Hour), true, nil
}

// CreateChangelogEntry -> POST /api/changelog/entries. A draft unless
// "published": true or a "date" is given.
func (a *App) CreateChangelogEntry(w http.ResponseWriter, r *http.Request) {
	var req createChangelogEntryRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Title, req.Body = strings.TrimSpace(req.Title), strings.TrimSpace(req.Body)
	if req.Title == "" || req.Body == "" {
		writeError(w, http.StatusBadRequest, "title and body are required")
		return
	}
	date, dated, err := parseChangelogDate(req.Date)
	if err != nil {
		writeError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	entry, err := a.Store.CreateChangelogEntry(r.Context(), req.Title, req.Body, changelogAPIAuthor)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create changelog entry")
		return
	}
	if dated {
		if entry, err = a.Store.SetChangelogPublishedAt(r.Context(), entry.ID, date); err != nil {
			writeError(w, http.StatusInternalServerError, "created the entry but could not publish it")
			return
		}
	} else if req.Published {
		published := true
		if entry, err = a.Store.UpdateChangelogEntry(r.Context(), entry.ID, db.UpdateChangelogEntryInput{Published: &published}); err != nil {
			writeError(w, http.StatusInternalServerError, "created the entry but could not publish it")
			return
		}
	}
	writeJSON(w, http.StatusCreated, toChangelogEntryResponse(entry))
}

type updateChangelogEntryRequest struct {
	adminUpdateChangelogRequest
	Date string `json:"date"`
}

// UpdateChangelogEntry -> PATCH /api/changelog/entries/{id}: any of title,
// body, published and date (which also publishes).
func (a *App) UpdateChangelogEntry(w http.ResponseWriter, r *http.Request) {
	var req updateChangelogEntryRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	date, dated, err := parseChangelogDate(req.Date)
	if err != nil {
		writeError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	if (req.Title != nil && strings.TrimSpace(*req.Title) == "") || (req.Body != nil && strings.TrimSpace(*req.Body) == "") {
		writeError(w, http.StatusBadRequest, "title and body can't be empty")
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
	if dated {
		if entry, err = a.Store.SetChangelogPublishedAt(r.Context(), entry.ID, date); err != nil {
			writeError(w, http.StatusInternalServerError, "could not set the date")
			return
		}
	}
	writeJSON(w, http.StatusOK, toChangelogEntryResponse(entry))
}

// DeleteChangelogEntry -> DELETE /api/changelog/entries/{id}
func (a *App) DeleteChangelogEntry(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteChangelogEntry(r.Context(), r.PathValue("id")); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "changelog entry not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not delete changelog entry")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ownChangelog turns the published entries into the public shape: the date
// it was published, and the body split into notes, one per line (a leading
// "- " or "* " is dropped).
func (a *App) ownChangelog(r *http.Request) ([]changelogEntry, error) {
	entries, err := a.Store.ListChangelogEntries(r.Context())
	if err != nil {
		return nil, err
	}
	// Newest first; entries published at the same moment (a dated batch) keep
	// the order they were written in.
	sort.SliceStable(entries, func(i, j int) bool {
		pi, pj := entries[i].PublishedAt.Time, entries[j].PublishedAt.Time
		if !pi.Equal(pj) {
			return pi.After(pj)
		}
		return entries[i].CreatedAt.Before(entries[j].CreatedAt)
	})
	out := []changelogEntry{}
	for _, e := range entries {
		if !e.PublishedAt.Valid {
			continue
		}
		out = append(out, changelogEntry{
			ID:    e.ID,
			Title: e.Title,
			Date:  e.PublishedAt.Time.UTC().Format("2006-01-02"),
			Notes: notesFromBody(e.Body),
		})
	}
	return out, nil
}

func notesFromBody(body string) []string {
	notes := []string{}
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(line, "- "), "* "))
		if line != "" {
			notes = append(notes, line)
		}
	}
	return notes
}
