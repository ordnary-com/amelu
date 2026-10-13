package handlers

import (
	"context"
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Ordnary publishes one changelog for all its products; Amelu's entries are
// the items with <category>Amelu</category>. The feed has no CORS headers,
// so the dashboard reads it through this API rather than directly.
const changelogFeedURL = "https://ordnary.com/changelog/rss.xml"

const changelogCacheTTL = 10 * time.Minute

type changelogEntry struct {
	ID    string   `json:"id"`
	Title string   `json:"title"`
	Date  string   `json:"date"`
	Link  string   `json:"link"`
	Notes []string `json:"notes"`
}

type changelogCache struct {
	mu        sync.Mutex
	entries   []changelogEntry
	fetchedAt time.Time
}

var changelog changelogCache

// GetChangelog -> GET /api/changelog
func (a *App) GetChangelog(w http.ResponseWriter, r *http.Request) {
	entries, err := changelog.get(r.Context())
	if err != nil {
		writeUpstreamError(w, "could not load the changelog", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

func (c *changelogCache) get(ctx context.Context) ([]changelogEntry, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.entries != nil && time.Since(c.fetchedAt) < changelogCacheTTL {
		return c.entries, nil
	}
	entries, err := fetchChangelog(ctx)
	if err != nil {
		// A stale copy beats an error page while the feed is unreachable.
		if c.entries != nil {
			return c.entries, nil
		}
		return nil, err
	}
	c.entries, c.fetchedAt = entries, time.Now()
	return entries, nil
}

type rssFeed struct {
	Items []struct {
		Title       string   `xml:"title"`
		Link        string   `xml:"link"`
		GUID        string   `xml:"guid"`
		PubDate     string   `xml:"pubDate"`
		Categories  []string `xml:"category"`
		Description string   `xml:"description"`
	} `xml:"channel>item"`
}

func fetchChangelog(ctx context.Context) ([]changelogEntry, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, changelogFeedURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch changelog feed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("changelog feed returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read changelog feed: %w", err)
	}
	return parseChangelog(body)
}

func parseChangelog(body []byte) ([]changelogEntry, error) {
	var feed rssFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("parse changelog feed: %w", err)
	}
	entries := []changelogEntry{}
	for _, item := range feed.Items {
		if !hasCategory(item.Categories, "Amelu") {
			continue
		}
		date := ""
		if t, err := time.Parse(time.RFC1123, item.PubDate); err == nil {
			date = t.UTC().Format("2006-01-02")
		}
		entries = append(entries, changelogEntry{
			ID:    item.GUID,
			Title: strings.TrimSpace(strings.TrimPrefix(item.Title, "Amelu:")),
			Date:  date,
			Link:  item.Link,
			Notes: splitNotes(html.UnescapeString(item.Description)),
		})
	}
	return entries, nil
}

func hasCategory(categories []string, want string) bool {
	for _, c := range categories {
		if strings.EqualFold(strings.TrimSpace(c), want) {
			return true
		}
	}
	return false
}

// The feed flattens a bullet list into one line: "- first - second". A
// description that doesn't start with a dash is a single paragraph.
var noteSeparator = regexp.MustCompile(`\s+-\s+`)

func splitNotes(description string) []string {
	description = strings.TrimSpace(description)
	if !strings.HasPrefix(description, "- ") {
		return []string{description}
	}
	var notes []string
	for _, part := range noteSeparator.Split(strings.TrimPrefix(description, "- "), -1) {
		if part = strings.TrimSpace(part); part != "" {
			notes = append(notes, part)
		}
	}
	return notes
}
