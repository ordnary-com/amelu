package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"amelu/backend/internal/db"
)

// New tickets are also posted to a Discord channel through a webhook
// (SUPPORT_DISCORD_WEBHOOK_URL), as an embed that links to the ticket in
// Airplane. Replies on existing tickets only go out by email.

const airplaneTicketURL = "https://airplane.ordnary.com/amelu/support/tickets/"

// The notifySupport kinds that open a ticket.
var discordNewTicketKinds = map[string]bool{"New ticket": true, "Sending review": true, "Dedicated IP request": true}

// Same labels as the dashboard's topic list (frontend support-meta.ts).
var supportCategoryLabels = map[string]string{
	"delivery":       "Sending or receiving mail",
	"domains":        "Domains and DNS",
	"account":        "Account and mailboxes",
	"billing":        "Billing and plans",
	"other":          "Something else",
	"dedicated_ip":   "Dedicated IP",
	"sending_review": "Sending review",
}

type discordEmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

type discordEmbed struct {
	Author      map[string]string   `json:"author,omitempty"`
	Title       string              `json:"title"`
	URL         string              `json:"url,omitempty"`
	Description string              `json:"description,omitempty"`
	Color       int                 `json:"color"`
	Fields      []discordEmbedField `json:"fields"`
	Footer      map[string]string   `json:"footer,omitempty"`
	Timestamp   string              `json:"timestamp,omitempty"`
}

type discordWebhookPayload struct {
	Username string         `json:"username"`
	Embeds   []discordEmbed `json:"embeds"`
	// Mentions in a customer's text must not ping anyone.
	AllowedMentions map[string][]string `json:"allowed_mentions"`
}

// discordTicketPayload builds the message for a new ticket.
func discordTicketPayload(t *db.SupportTicket, kind, body string) discordWebhookPayload {
	topic := supportCategoryLabels[t.Category]
	if topic == "" {
		topic = t.Category
	}
	customer := t.OpenedByName
	if t.OpenedByEmail != "" {
		customer += "\n" + t.OpenedByEmail
	}
	fields := []discordEmbedField{
		{Name: "Customer", Value: discordValue(customer, 256), Inline: true},
		{Name: "Organization", Value: discordValue(t.OrganizationName, 256), Inline: true},
		{Name: "Topic", Value: discordValue(topic, 256), Inline: true},
	}
	if t.DomainName.Valid {
		fields = append(fields, discordEmbedField{Name: "Domain", Value: discordValue(t.DomainName.String, 256), Inline: true})
	}
	fields = append(fields, discordEmbedField{Name: "Priority", Value: discordValue(capitalize(t.Priority), 64), Inline: true})
	created := t.CreatedAt
	if created.IsZero() {
		created = time.Now()
	}
	return discordWebhookPayload{
		Username: "Amelu Support",
		Embeds: []discordEmbed{{
			Author:      map[string]string{"name": kind},
			Title:       truncateRunes(fmt.Sprintf("#%d %s", t.Number, t.Subject), 256),
			URL:         airplaneTicketURL + t.ID,
			Description: quoteForDiscord(truncateRunes(strings.TrimSpace(body), 1500)),
			Color:       0x0051fe,
			Fields:      fields,
			Footer:      map[string]string{"text": "Amelu · Answer in Airplane under Amelu, Support"},
			Timestamp:   created.UTC().Format(time.RFC3339),
		}},
		AllowedMentions: map[string][]string{"parse": {}},
	}
}

// notifyDiscord posts a new ticket to the support channel. Like the email it
// never fails the request.
func (a *App) notifyDiscord(t *db.SupportTicket, kind, body string) {
	if a.SupportDiscordWebhookURL == "" || !discordNewTicketKinds[kind] {
		return
	}
	payload, err := json.Marshal(discordTicketPayload(t, kind, body))
	if err != nil {
		log.Printf("support: discord payload for #%d: %v", t.Number, err)
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.SupportDiscordWebhookURL, bytes.NewReader(payload))
		if err != nil {
			log.Printf("support: discord request for #%d: %v", t.Number, err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("support: discord webhook for #%d: %v", t.Number, err)
			return
		}
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			log.Printf("support: discord webhook for #%d: status %d", t.Number, resp.StatusCode)
		}
	}()
}

// quoteForDiscord shows the customer's text as a block quote, so it reads as
// their words and markdown in it can't break out of the embed's layout.
func quoteForDiscord(s string) string {
	if s == "" {
		return ""
	}
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = "> " + l
	}
	return strings.Join(lines, "\n")
}

func discordValue(s string, max int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "-"
	}
	return truncateRunes(s, max)
}

func truncateRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max-1]) + "…"
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	return strings.ToUpper(string(r[0])) + string(r[1:])
}
