package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"amelu/backend/internal/auth"
	"amelu/backend/internal/db"
	"amelu/backend/internal/stalwart"
)

func TestSendPausedSkipsTheOwnersOwnChoice(t *testing.T) {
	states := []stalwart.AccountSendState{
		{Name: "sales", SendDisabled: true},
		{Name: "info", SendDisabled: false},
		{Name: "noreply", SendDisabled: true},
		{Name: "Admin", SendDisabled: true},
	}
	mailboxes := []db.Mailbox{
		{LocalPart: "sales", MaySend: true},
		{LocalPart: "info", MaySend: true},
		{LocalPart: "noreply", MaySend: false},
	}
	got := sendPaused(states, mailboxes)
	if strings.Join(got, ",") != "Admin,sales" {
		t.Fatalf("got %v, want Admin and sales (noreply was switched off by its owner)", got)
	}
	if got := sendPaused(nil, nil); got == nil || len(got) != 0 {
		t.Fatalf("nothing paused must be an empty list, not nil: %#v", got)
	}
}

func TestCustomerReasonDropsTheCounts(t *testing.T) {
	cases := map[string]string{
		"8 recipients that don't exist": "Many messages went to addresses that don't exist.",
		"41 recipient domains; 4 recipients that don't exist": "Messages went to an unusually large number of different domains in a short time. " +
			"Many messages went to addresses that don't exist.",
		"30 Gmail 'unsolicited' refusals": "Gmail refused messages as unsolicited mail.",
		"6 policy or spam refusals":       "Receiving servers refused messages as spam or against their policy.",
		"":                                "Mail from this domain looked like cold outreach or bulk mail to a list.",
	}
	for in, want := range cases {
		if got := customerReason("sender_guard", in); got != want {
			t.Errorf("%q: got %q, want %q", in, got, want)
		}
	}
	if got := customerReason("staff", "We received complaints about mail from this domain."); got != "We received complaints about mail from this domain." {
		t.Errorf("staff reasons are shown as written, got %q", got)
	}
}

// fakeStalwart answers the read-only calls DomainSendStates makes and fails
// the test on anything else: the status page must never write to Stalwart.
type fakeStalwart struct {
	t    *testing.T
	mu   sync.Mutex
	down bool
	// Account name -> emailSend disabled.
	accounts map[string]bool
}

func (f *fakeStalwart) set(down bool, accounts map[string]bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.down, f.accounts = down, accounts
}

func (f *fakeStalwart) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.down {
		http.Error(w, "unavailable", http.StatusBadGateway)
		return
	}
	var req struct {
		MethodCalls [][]json.RawMessage `json:"methodCalls"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	var method string
	json.Unmarshal(req.MethodCalls[0][0], &method)
	var args any
	switch method {
	case "x:Domain/query":
		args = map[string]any{"ids": []string{"dom"}}
	case "x:Account/query":
		ids := []string{}
		for name := range f.accounts {
			ids = append(ids, name)
		}
		args = map[string]any{"ids": ids}
	case "x:Account/get":
		list := []any{}
		for name, disabled := range f.accounts {
			perms := map[string]any{"@type": "Inherit"}
			if disabled {
				perms = map[string]any{"@type": "Merge", "disabledPermissions": map[string]bool{"emailSend": true}, "enabledPermissions": map[string]bool{}}
			}
			list = append(list, map[string]any{"id": name, "name": name, "permissions": perms})
		}
		args = map[string]any{"list": list}
	default:
		f.t.Errorf("unexpected Stalwart call %s", method)
		args = map[string]any{}
	}
	json.NewEncoder(w).Encode(map[string]any{"methodResponses": []any{[]any{method, args, "c1"}}})
}

// Needs DATABASE_URL, like the store tests in internal/db; skipped without it.
func TestDomainStatusFollowsStalwart(t *testing.T) {
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
	org, err := store.CreateOrganization(ctx, "Status Test "+suffix)
	if err != nil {
		t.Fatal(err)
	}
	// Customers don't cascade from their organization; their domains and sessions cascade from them.
	t.Cleanup(func() {
		conn.ExecContext(context.Background(), `DELETE FROM customers WHERE organization_id = $1`, org.ID)
		conn.ExecContext(context.Background(), `DELETE FROM organizations WHERE id = $1`, org.ID)
	})
	owner, err := store.CreateCustomer(ctx, "status-"+suffix+"@example.com", "Owner", "hash", org.ID, "Owner", "Test", "status"+suffix)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AddOrganizationMember(ctx, org.ID, owner.ID, db.RoleOwner); err != nil {
		t.Fatal(err)
	}
	name := "status-" + suffix + ".example"
	dom, err := store.CreateDomain(ctx, owner.ID, name, false)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.MarkDomainOwnershipVerified(ctx, dom.ID); err != nil {
		t.Fatal(err)
	}
	for _, lp := range []string{"sales", "info", "noreply"} {
		mb, err := store.CreateMailbox(ctx, dom.ID, lp, lp)
		if err != nil {
			t.Fatal(err)
		}
		if lp == "noreply" {
			if err := store.UpdateMailboxServices(ctx, mb.ID, false, true, true, true, true, true); err != nil {
				t.Fatal(err)
			}
		}
	}
	token := "test-" + suffix
	if err := store.CreateSession(ctx, auth.HashToken(token), owner.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}

	fake := &fakeStalwart{t: t}
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)
	app := &App{Store: store, Stalwart: stalwart.NewClient(srv.URL, "admin", "pw")}

	const secret = "test-secret"
	job := auth.RequireInternal(secret, app.DomainActionJob)
	post := func(body map[string]any) (int, string) {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/domain-actions", bytes.NewReader(raw))
		req.Header.Set(auth.InternalAuthHeader, auth.SignInternalRequest(secret, http.MethodPost, "/internal/jobs/domain-actions", time.Now()))
		rec := httptest.NewRecorder()
		job(rec, req)
		var out struct {
			Status string `json:"status"`
		}
		json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out.Status
	}
	status := func() domainStatusResponse {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/api/domains/"+dom.ID+"/status", nil)
		req.SetPathValue("id", dom.ID)
		req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: token})
		rec := httptest.NewRecorder()
		auth.Require(store, app.GetDomainStatus)(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status: %d %s", rec.Code, rec.Body)
		}
		var out domainStatusResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}

	unsigned := httptest.NewRecorder()
	job(unsigned, httptest.NewRequest(http.MethodPost, "/internal/jobs/domain-actions", strings.NewReader(`{}`)))
	if unsigned.Code != http.StatusUnauthorized {
		t.Fatalf("unsigned report: %d", unsigned.Code)
	}
	if code, _ := post(map[string]any{"domain": "nobody-" + suffix + ".example", "kind": "sending_paused"}); code != http.StatusNotFound {
		t.Fatalf("unknown domain: %d", code)
	}
	if code, _ := post(map[string]any{"domain": name, "kind": "bogus"}); code != http.StatusBadRequest {
		t.Fatalf("unknown kind: %d", code)
	}

	// A pause marduk never reported: shown as paused, without a made-up reason.
	fake.set(false, map[string]bool{"sales": true, "info": true, "noreply": true})
	got := status()
	if got.Sending.State != "paused" || strings.Join(got.Sending.PausedMailboxes, ",") != "info@"+name+",sales@"+name || got.Sending.Reason != nil || !got.Attention {
		t.Fatalf("unreported pause: %+v", got.Sending)
	}

	at := "2026-11-18T18:17:00Z"
	if code, s := post(map[string]any{"domain": strings.ToUpper(name), "kind": "sending_paused", "reason": "8 recipients that don't exist", "at": at}); code != http.StatusOK || s != "recorded" {
		t.Fatalf("record: %d %s", code, s)
	}
	if code, s := post(map[string]any{"domain": name, "kind": "sending_paused", "reason": "8 recipients that don't exist", "at": at}); code != http.StatusOK || s != "already_open" {
		t.Fatalf("repeat: %d %s", code, s)
	}
	got = status()
	if got.Sending.Reason == nil || *got.Sending.Reason != "Many messages went to addresses that don't exist." || got.Sending.Since.Format(time.RFC3339) != at {
		t.Fatalf("reported pause: %+v", got.Sending)
	}
	if len(got.Actions) != 1 || !got.Actions[0].Active || got.Actions[0].Source != "sender_guard" {
		t.Fatalf("history: %+v", got.Actions)
	}

	// Stalwart unreachable: the rest still loads and the open pause stays open.
	fake.set(true, nil)
	got = status()
	if got.Sending.State != "unknown" || len(got.Actions) != 1 || !got.Actions[0].Active {
		t.Fatalf("Stalwart down: %+v %+v", got.Sending, got.Actions)
	}

	// Lifted on marduk by hand: the page notices and closes the action.
	fake.set(false, map[string]bool{"sales": false, "info": false, "noreply": true})
	got = status()
	if got.Sending.State != "ok" || len(got.Sending.PausedMailboxes) != 0 || got.Attention {
		t.Fatalf("after lift: %+v", got.Sending)
	}
	if len(got.Actions) != 1 || got.Actions[0].Active || got.Actions[0].LiftedAt == nil {
		t.Fatalf("history after lift: %+v", got.Actions)
	}
	var liftedBy sql.NullString
	conn.QueryRowContext(ctx, `SELECT lifted_by FROM domain_actions WHERE domain_id = $1`, dom.ID).Scan(&liftedBy)
	if liftedBy.String != "detected" {
		t.Fatalf("lifted_by = %q, want detected", liftedBy.String)
	}
	if code, s := post(map[string]any{"domain": name, "kind": "sending_paused", "lifted": true}); code != http.StatusOK || s != "not_open" {
		t.Fatalf("lifting again: %d %s", code, s)
	}

	if _, err := conn.ExecContext(ctx, `UPDATE customers SET suspended_at = now(), suspended_reason = 'internal: spam run' WHERE id = $1`, owner.ID); err != nil {
		t.Fatal(err)
	}
	// The suspended owner can't sign in any more; a second member looks instead.
	member, err := store.CreateCustomer(ctx, "member-"+suffix+"@example.com", "Member", "hash", org.ID, "Member", "Test", "member"+suffix)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AddOrganizationMember(ctx, org.ID, member.ID, db.RoleAdmin); err != nil {
		t.Fatal(err)
	}
	token = "member-" + suffix
	if err := store.CreateSession(ctx, auth.HashToken(token), member.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	got = status()
	if !got.Account.Suspended || strings.Contains(got.Account.Message, "internal") || !got.Attention {
		t.Fatalf("suspended account: %+v", got.Account)
	}
}
