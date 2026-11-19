package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

// Needs DATABASE_URL, like TestDomainStatusFollowsStalwart; skipped without it.
func TestSendingReviewRequest(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set, skipping database-backed test")
	}
	ctx := context.Background()
	conn, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	if err := db.Migrate(ctx, conn); err != nil {
		t.Fatal(err)
	}
	store := db.NewStore(conn)

	suffix := randomHex(8)
	org, err := store.CreateOrganization(ctx, "Review Test "+suffix)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		conn.ExecContext(context.Background(), `DELETE FROM customers WHERE organization_id = $1`, org.ID)
		conn.ExecContext(context.Background(), `DELETE FROM organizations WHERE id = $1`, org.ID)
	})
	session := func(local, role string) (token, id string) {
		t.Helper()
		c, err := store.CreateCustomer(ctx, local+"-"+suffix+"@example.com", local, "hash", org.ID, local, "Test", local+suffix)
		if err != nil {
			t.Fatal(err)
		}
		if err := store.AddOrganizationMember(ctx, org.ID, c.ID, role); err != nil {
			t.Fatal(err)
		}
		token = local + "-" + suffix
		if err := store.CreateSession(ctx, auth.HashToken(token), c.ID, time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
		return token, c.ID
	}
	owner, ownerID := session("owner", db.RoleOwner)
	helpdesk, _ := session("helpdesk", db.RoleHelpdesk)

	name := "review-" + suffix + ".example"
	dom, err := store.CreateDomain(ctx, ownerID, name, false)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.MarkDomainOwnershipVerified(ctx, dom.ID); err != nil {
		t.Fatal(err)
	}
	for _, lp := range []string{"sales", "info"} {
		if _, err := store.CreateMailbox(ctx, dom.ID, lp, lp); err != nil {
			t.Fatal(err)
		}
	}

	fake := &fakeStalwart{t: t}
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)
	app := &App{Store: store, Stalwart: stalwart.NewClient(srv.URL, "admin", "pw")}

	valid := map[string]any{
		"sends":            "Order confirmations and shipping updates",
		"recipients":       "People who ordered in our web shop",
		"collection":       "customers",
		"collectionDetail": "",
		"volume":           "100-1k",
		"changes":          "Removed every address that bounced",
		"acceptPolicy":     true,
	}
	with := func(changes map[string]any) map[string]any {
		out := map[string]any{}
		for k, v := range valid {
			out[k] = v
		}
		for k, v := range changes {
			out[k] = v
		}
		return out
	}
	request := func(token string, body map[string]any) (int, sendingReviewResponse) {
		t.Helper()
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/api/domains/"+dom.ID+"/status/review-request", bytes.NewReader(raw))
		req.SetPathValue("id", dom.ID)
		req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: token})
		rec := httptest.NewRecorder()
		auth.Require(store, app.CreateSendingReview)(rec, req)
		var out sendingReviewResponse
		json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}
	status := func() domainStatusResponse {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/api/domains/"+dom.ID+"/status", nil)
		req.SetPathValue("id", dom.ID)
		req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: owner})
		rec := httptest.NewRecorder()
		auth.Require(store, app.GetDomainStatus)(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status: %d %s", rec.Code, rec.Body)
		}
		var out domainStatusResponse
		json.Unmarshal(rec.Body.Bytes(), &out)
		return out
	}
	const secret = "test-secret"
	job := func(body map[string]any) string {
		t.Helper()
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/domain-actions", bytes.NewReader(raw))
		req.Header.Set(auth.InternalAuthHeader, auth.SignInternalRequest(secret, http.MethodPost, "/internal/jobs/domain-actions", time.Now()))
		rec := httptest.NewRecorder()
		auth.RequireInternal(secret, app.DomainActionJob)(rec, req)
		var out struct {
			Status string `json:"status"`
		}
		json.Unmarshal(rec.Body.Bytes(), &out)
		return out.Status
	}
	messages := func(ticketID string) []db.SupportMessage {
		t.Helper()
		msgs, err := store.ListSupportMessages(ctx, ticketID, true)
		if err != nil {
			t.Fatal(err)
		}
		return msgs
	}

	// Nothing to review while every mailbox can send, or when we can't tell.
	fake.set(false, map[string]bool{"sales": false, "info": false})
	if code, _ := request(owner, valid); code != http.StatusConflict {
		t.Fatalf("not paused: %d", code)
	}
	fake.set(true, nil)
	if code, _ := request(owner, valid); code != http.StatusServiceUnavailable {
		t.Fatalf("Stalwart down: %d", code)
	}

	fake.set(false, map[string]bool{"sales": true, "info": false})
	if s := job(map[string]any{"domain": name, "kind": "sending_paused", "reason": "8 recipients that don't exist", "at": "2026-11-18T18:17:00Z"}); s != "recorded" {
		t.Fatalf("record pause: %s", s)
	}
	if code, _ := request(helpdesk, valid); code != http.StatusForbidden {
		t.Fatalf("helpdesk: %d", code)
	}
	for label, body := range map[string]map[string]any{
		"no policy":        with(map[string]any{"acceptPolicy": false}),
		"other, no detail": with(map[string]any{"collection": "other"}),
		"unknown volume":   with(map[string]any{"volume": "lots"}),
		"empty answer":     with(map[string]any{"changes": "  "}),
		"too long":         with(map[string]any{"sends": strings.Repeat("x", sendingReviewTextMax+1)}),
	} {
		if code, _ := request(owner, body); code != http.StatusBadRequest {
			t.Errorf("%s: %d", label, code)
		}
	}

	code, created := request(owner, valid)
	if code != http.StatusCreated || created.Existing || created.Number == 0 || created.Status != "open" {
		t.Fatalf("create: %d %+v", code, created)
	}
	ticket, err := store.GetSupportTicket(ctx, created.TicketID)
	if err != nil {
		t.Fatal(err)
	}
	if ticket.Category != "sending_review" || ticket.Subject != "Sending review for "+name || ticket.DomainID.String != dom.ID {
		t.Fatalf("ticket: %+v", ticket)
	}
	msgs := messages(created.TicketID)
	if len(msgs) != 2 || msgs[0].AuthorKind != "customer" || msgs[1].AuthorKind != "system" {
		t.Fatalf("messages: %+v", msgs)
	}
	first := msgs[0].Body
	for _, want := range []string{
		"Paused since: 18 Nov 2026, 18:17 UTC", "Reason: Many messages went to addresses that don't exist.",
		"Paused mailboxes: sales@" + name + "\n", "Our own customers or contacts", "100 to 1,000 messages a day",
		"Removed every address that bounced", "https://amelu.org/acceptable-use",
	} {
		if !strings.Contains(first, want) {
			t.Errorf("first message lacks %q:\n%s", want, first)
		}
	}
	if strings.Contains(first, "8 recipients") {
		t.Errorf("first message shows the guard's count:\n%s", first)
	}

	if code, again := request(owner, valid); code != http.StatusOK || !again.Existing || again.TicketID != created.TicketID {
		t.Fatalf("second request: %d %+v", code, again)
	}
	var tickets int
	conn.QueryRowContext(ctx, `SELECT count(*) FROM support_tickets WHERE domain_id = $1`, dom.ID).Scan(&tickets)
	if tickets != 1 {
		t.Fatalf("%d tickets, want 1", tickets)
	}
	if got := status(); got.Review == nil || got.Review.Number != created.Number {
		t.Fatalf("status review: %+v", got.Review)
	}

	// Staff lift it on marduk: the guard reports it and the ticket hears about it.
	if s := job(map[string]any{"domain": name, "kind": "sending_paused", "lifted": true}); s != "lifted" {
		t.Fatalf("lift: %s", s)
	}
	msgs = messages(created.TicketID)
	if len(msgs) != 3 || msgs[2].AuthorKind != "system" || msgs[2].Body != sendingRestored(name) {
		t.Fatalf("after lift: %+v", msgs)
	}
	if ticket, _ = store.GetSupportTicket(ctx, created.TicketID); ticket.Status != "open" {
		t.Fatalf("the lift changed the ticket's status to %s", ticket.Status)
	}
	if s := job(map[string]any{"domain": name, "kind": "sending_paused", "lifted": true}); s != "not_open" || len(messages(created.TicketID)) != 3 {
		t.Fatalf("a repeated lift must not add a note: %s", s)
	}

	// Paused again, then lifted by hand without a report: the status page notices.
	job(map[string]any{"domain": name, "kind": "sending_paused", "reason": "41 recipient domains"})
	fake.set(false, map[string]bool{"sales": false, "info": false})
	if got := status(); got.Sending.State != "ok" {
		t.Fatalf("after manual lift: %+v", got.Sending)
	}
	if msgs = messages(created.TicketID); len(msgs) != 4 || msgs[3].Body != sendingRestored(name) {
		t.Fatalf("after detected lift: %+v", msgs)
	}

	closed := "closed"
	if err := store.UpdateSupportTicket(ctx, created.TicketID, &closed, nil, nil); err != nil {
		t.Fatal(err)
	}
	if got := status(); got.Review != nil {
		t.Fatalf("closed review still shown: %+v", got.Review)
	}
}
