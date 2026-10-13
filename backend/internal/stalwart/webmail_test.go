package stalwart

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// webmailFake answers /.well-known/jmap and /jmap with canned responses per
// method, recording the calls it saw.
type webmailFake struct {
	t        *testing.T
	calls    []map[string]any
	respond  map[string]any
	userPass string
}

func (f *webmailFake) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, _ := r.BasicAuth()
		if r.URL.Path == "/.well-known/jmap" {
			if user == "someone@example.com" && pass == f.userPass {
				json.NewEncoder(w).Encode(map[string]any{"primaryAccounts": map[string]string{"urn:ietf:params:jmap:mail": "acc1"}})
				return
			}
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/jmap" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var req struct {
			MethodCalls [][]json.RawMessage `json:"methodCalls"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		var method string
		json.Unmarshal(req.MethodCalls[0][0], &method)
		var args map[string]any
		json.Unmarshal(req.MethodCalls[0][1], &args)
		f.calls = append(f.calls, map[string]any{"method": method, "args": args})
		resp, ok := f.respond[method]
		if !ok {
			f.t.Fatalf("unexpected method %s", method)
		}
		json.NewEncoder(w).Encode(map[string]any{"methodResponses": [][]any{{method, resp, "c1"}}})
	})
}

func newWebmailFake(t *testing.T) (*webmailFake, *Client) {
	f := &webmailFake{t: t, respond: map[string]any{}, userPass: "right"}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)
	return f, NewClient(srv.URL, "admin", "adminpw")
}

func TestAuthenticateUser(t *testing.T) {
	_, c := newWebmailFake(t)
	id, err := c.AuthenticateUser(context.Background(), "someone@example.com", "right")
	if err != nil || id != "acc1" {
		t.Fatalf("got %q, %v", id, err)
	}
	if _, err := c.AuthenticateUser(context.Background(), "someone@example.com", "wrong"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong password: got %v", err)
	}
}

func TestQueryMailKeepsQueryOrderAndFilters(t *testing.T) {
	f, c := newWebmailFake(t)
	f.respond["Email/query"] = map[string]any{"ids": []string{"b", "a"}, "total": 7}
	f.respond["Email/get"] = map[string]any{"list": []map[string]any{
		{"id": "a", "subject": "first", "keywords": map[string]bool{"$seen": true}, "mailboxIds": map[string]bool{"inbox": true}, "size": 10},
		{"id": "b", "subject": "second", "keywords": map[string]bool{"$flagged": true}, "mailboxIds": map[string]bool{"inbox": true}, "size": 20},
	}}
	msgs, total, err := c.QueryMail(context.Background(), "acc1", MailQuery{FolderID: "inbox", Text: "hello", Unread: true, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if total != 7 || len(msgs) != 2 || msgs[0].ID != "b" || msgs[1].ID != "a" {
		t.Fatalf("got total %d, ids %v", total, msgs)
	}
	if !msgs[0].Flagged || msgs[0].Seen || !msgs[1].Seen || msgs[1].FolderIDs[0] != "inbox" {
		t.Fatalf("flags not mapped: %+v", msgs)
	}
	filter := f.calls[0]["args"].(map[string]any)["filter"].(map[string]any)
	if filter["operator"] != "AND" || len(filter["conditions"].([]any)) != 3 {
		t.Fatalf("filter = %v", filter)
	}
}

func TestEmailObjectAndSend(t *testing.T) {
	f, c := newWebmailFake(t)
	f.respond["Email/set"] = map[string]any{"created": map[string]any{"e0": map[string]string{"id": "m1"}}}
	f.respond["EmailSubmission/set"] = map[string]any{"created": map[string]any{"s0": map[string]string{"id": "s1"}}}
	d := Draft{
		To: []Address{{Email: "to@example.com"}}, BCC: []Address{{Email: "bcc@example.com"}},
		Subject: "Hi", Text: "plain", InReplyTo: "<x@y>", References: []string{"<x@y>"},
		Attachments: []MailAttachment{{BlobID: "blob1", Name: "a.pdf", Type: "application/pdf"}},
	}
	id, err := c.SendMail(context.Background(), "acc1", Address{Name: "Me", Email: "me@example.com"}, "ident1", d, "drafts", "sent")
	if err != nil || id != "m1" {
		t.Fatalf("got %q, %v", id, err)
	}
	create := f.calls[0]["args"].(map[string]any)["create"].(map[string]any)["e0"].(map[string]any)
	if create["inReplyTo"].([]any)[0] != "<x@y>" || create["attachments"].([]any)[0].(map[string]any)["blobId"] != "blob1" {
		t.Fatalf("email object = %v", create)
	}
	if _, hasHTML := create["htmlBody"]; hasHTML {
		t.Fatal("plain-text draft must not carry an htmlBody")
	}
	sub := f.calls[1]["args"].(map[string]any)
	rcpt := sub["create"].(map[string]any)["s0"].(map[string]any)["envelope"].(map[string]any)["rcptTo"].([]any)
	if len(rcpt) != 2 {
		t.Fatalf("bcc must be in the envelope: %v", rcpt)
	}
	onSuccess := sub["onSuccessUpdateEmail"].(map[string]any)["#s0"].(map[string]any)
	if onSuccess["mailboxIds/sent"] != true || onSuccess["mailboxIds/drafts"] != nil {
		t.Fatalf("onSuccessUpdateEmail = %v", onSuccess)
	}
}

func TestSendCleansUpOnRefusedSubmission(t *testing.T) {
	f, c := newWebmailFake(t)
	f.respond["Email/set"] = map[string]any{"created": map[string]any{"e0": map[string]string{"id": "m1"}}}
	f.respond["EmailSubmission/set"] = map[string]any{"notCreated": map[string]any{"s0": map[string]string{"type": "forbiddenFrom"}}}
	_, err := c.SendMail(context.Background(), "acc1", Address{Email: "me@example.com"}, "ident1", Draft{To: []Address{{Email: "to@example.com"}}}, "drafts", "sent")
	var se *Error
	if !errors.As(err, &se) || se.Kind != KindJMAP {
		t.Fatalf("got %v", err)
	}
	last := f.calls[len(f.calls)-1]
	if last["method"] != "Email/set" || last["args"].(map[string]any)["destroy"] == nil {
		t.Fatalf("draft not destroyed after refused submission: %v", last)
	}
}

func TestDeleteFolderMovesMailFirst(t *testing.T) {
	f, c := newWebmailFake(t)
	page := 0
	f.respond["Email/query"] = map[string]any{"ids": []string{"m1", "m2"}, "total": 2}
	f.respond["Email/set"] = map[string]any{}
	f.respond["Mailbox/set"] = map[string]any{"destroyed": []string{"f1"}}
	// After the move the folder is empty.
	origin := f.handler()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/jmap" {
			page++
			if page == 3 {
				f.respond["Email/query"] = map[string]any{"ids": []string{}, "total": 0}
			}
		}
		origin.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	c = NewClient(srv.URL, "admin", "adminpw")
	if err := c.DeleteFolder(context.Background(), "acc1", "f1", "trash"); err != nil {
		t.Fatal(err)
	}
	methods := []string{}
	for _, call := range f.calls {
		methods = append(methods, call["method"].(string))
	}
	want := []string{"Email/query", "Email/set", "Email/query", "Mailbox/set"}
	if len(methods) != len(want) {
		t.Fatalf("calls = %v", methods)
	}
	for i := range want {
		if methods[i] != want[i] {
			t.Fatalf("calls = %v, want %v", methods, want)
		}
	}
}
