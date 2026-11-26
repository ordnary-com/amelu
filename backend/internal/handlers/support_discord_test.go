package handlers

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"

	"amelu/backend/internal/db"
)

func TestDiscordTicketPayload(t *testing.T) {
	ticket := &db.SupportTicket{
		ID: "abc", Number: 13, Subject: "Domain ownership not completing",
		Category: "domains", Priority: "normal", OrganizationName: "Acme",
		OpenedByName: "Ada", OpenedByEmail: "ada@example.com",
		DomainName: sql.NullString{String: "example.com", Valid: true},
	}
	p := discordTicketPayload(ticket, "New ticket", "line one\n@everyone line two")
	e := p.Embeds[0]
	if e.Title != "#13 Domain ownership not completing" || e.URL != airplaneTicketURL+"abc" {
		t.Fatalf("title/url = %q %q", e.Title, e.URL)
	}
	if e.Description != "> line one\n> @everyone line two" {
		t.Fatalf("description = %q", e.Description)
	}
	got := map[string]string{}
	for _, f := range e.Fields {
		got[f.Name] = f.Value
	}
	if got["Topic"] != "Domains and DNS" || got["Domain"] != "example.com" || got["Priority"] != "Normal" || got["Customer"] != "Ada\nada@example.com" {
		t.Fatalf("fields = %v", got)
	}
	raw, _ := json.Marshal(p)
	if !strings.Contains(string(raw), `"allowed_mentions":{"parse":[]}`) {
		t.Fatalf("mentions not disabled: %s", raw)
	}
}

func TestTruncateRunes(t *testing.T) {
	if got := truncateRunes("ğğğğ", 3); got != "ğğ…" {
		t.Fatalf("got %q", got)
	}
}
