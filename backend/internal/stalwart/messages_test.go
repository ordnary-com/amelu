package stalwart

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeJMAP is a stand-in for Stalwart's /jmap endpoint. It records every
// method call it receives and answers from a per-method table, which is what
// lets these tests pin the request shape (the part a live server would
// reject) without a live server.
type fakeJMAP struct {
	t         *testing.T
	responses map[string]string
	calls     []recordedCall
}

type recordedCall struct {
	method string
	args   map[string]any
}

func newFakeJMAP(t *testing.T, responses map[string]string) (*fakeJMAP, *Client, func()) {
	f := &fakeJMAP{t: t, responses: responses}
	srv := httptest.NewServer(f)
	return f, NewClient(srv.URL, "admin", "secret"), srv.Close
}

func (f *fakeJMAP) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/jmap" {
		f.t.Errorf("expected calls to /jmap, got %s", r.URL.Path)
	}
	if user, pass, ok := r.BasicAuth(); !ok || user != "admin" || pass != "secret" {
		f.t.Error("expected basic auth credentials on every call")
	}

	var req struct {
		MethodCalls [][]json.RawMessage `json:"methodCalls"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		f.t.Fatalf("decode request: %v", err)
	}

	var method string
	json.Unmarshal(req.MethodCalls[0][0], &method)
	var args map[string]any
	json.Unmarshal(req.MethodCalls[0][1], &args)
	f.calls = append(f.calls, recordedCall{method: method, args: args})

	body, ok := f.responses[method]
	if !ok {
		f.t.Fatalf("fake has no response for method %q", method)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"methodResponses":[["` + method + `",` + body + `,"c1"]]}`))
}

func (f *fakeJMAP) call(method string) (recordedCall, bool) {
	for _, c := range f.calls {
		if c.method == method {
			return c, true
		}
	}
	return recordedCall{}, false
}

// resolution covers the two lookups every mailbox-scoped call starts with.
func resolution() map[string]string {
	return map[string]string{
		"x:Domain/query":  `{"ids":["d1"]}`,
		"x:Account/query": `{"ids":["a1"]}`,
	}
}

func TestListMessages(t *testing.T) {
	responses := resolution()
	responses["Mailbox/query"] = `{"ids":["mb-inbox"]}`
	responses["Email/query"] = `{"ids":["e1","e2"],"total":7}`
	responses["Email/get"] = `{"list":[
		{"id":"e1","subject":"Hello","from":[{"email":"someone@example.com"}],
		 "to":[{"email":"agent@example.com"}],"receivedAt":"2026-07-30T10:00:00Z",
		 "preview":"Hi there","hasAttachment":true,"keywords":{"$seen":true}},
		{"id":"e2","subject":"Second","from":[{"email":"other@example.com"}],
		 "to":[{"email":"agent@example.com"}],"receivedAt":"2026-07-29T10:00:00Z","keywords":{}}
	]}`

	fake, client, done := newFakeJMAP(t, responses)
	defer done()

	messages, total, err := client.ListMessages(context.Background(), "agent", "example.com", RoleInbox, 25, 0)
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	if total != 7 {
		t.Errorf("total = %d, want 7", total)
	}
	if len(messages) != 2 {
		t.Fatalf("got %d messages, want 2", len(messages))
	}
	if messages[0].Subject != "Hello" || messages[0].From[0].Email != "someone@example.com" {
		t.Errorf("first message decoded wrong: %+v", messages[0])
	}
	if !messages[0].HasAttachments || !messages[0].Seen {
		t.Errorf("expected first message flagged as attached and seen: %+v", messages[0])
	}
	if messages[1].Seen {
		t.Error("second message has no $seen keyword and must not be marked seen")
	}

	query, ok := fake.call("Email/query")
	if !ok {
		t.Fatal("expected an Email/query call")
	}
	if query.args["filter"].(map[string]any)["inMailbox"] != "mb-inbox" {
		t.Errorf("Email/query must be scoped to the resolved mailbox, got %v", query.args["filter"])
	}
	if query.args["limit"] != float64(25) || query.args["position"] != float64(0) {
		t.Errorf("limit/position not passed through: %v", query.args)
	}

	mailbox, _ := fake.call("Mailbox/query")
	if mailbox.args["filter"].(map[string]any)["role"] != "inbox" {
		t.Errorf("expected the inbox role to be resolved, got %v", mailbox.args["filter"])
	}
}

func TestListMessages_EmptyMailbox(t *testing.T) {
	responses := resolution()
	responses["Mailbox/query"] = `{"ids":["mb-inbox"]}`
	responses["Email/query"] = `{"ids":[],"total":0}`

	_, client, done := newFakeJMAP(t, responses)
	defer done()

	messages, total, err := client.ListMessages(context.Background(), "agent", "example.com", RoleInbox, 25, 0)
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	// An empty page must not turn into a null JSON array downstream.
	if messages == nil || len(messages) != 0 || total != 0 {
		t.Errorf("got %v (total %d), want an empty non-nil slice", messages, total)
	}
}

func TestGetMessage_JoinsBodyParts(t *testing.T) {
	responses := resolution()
	responses["Email/get"] = `{"list":[{
		"id":"e1","subject":"Multipart","receivedAt":"2026-07-30T10:00:00Z",
		"from":[{"email":"someone@example.com"}],
		"bodyValues":{"1":{"value":"first "},"2":{"value":"second"},"h":{"value":"<p>hi</p>"}},
		"textBody":[{"partId":"1"},{"partId":"2"}],
		"htmlBody":[{"partId":"h"}],
		"attachments":[{"name":"invoice.pdf","type":"application/pdf","size":1234}]
	}]}`

	fake, client, done := newFakeJMAP(t, responses)
	defer done()

	msg, err := client.GetMessage(context.Background(), "agent", "example.com", "e1")
	if err != nil {
		t.Fatalf("GetMessage: %v", err)
	}
	if msg.TextBody != "first second" {
		t.Errorf("textBody = %q, want the parts joined in order", msg.TextBody)
	}
	if msg.HTMLBody != "<p>hi</p>" {
		t.Errorf("htmlBody = %q", msg.HTMLBody)
	}
	if len(msg.Attachments) != 1 || msg.Attachments[0].Name != "invoice.pdf" || msg.Attachments[0].Size != 1234 {
		t.Errorf("attachments decoded wrong: %+v", msg.Attachments)
	}

	get, _ := fake.call("Email/get")
	if get.args["fetchTextBodyValues"] != true || get.args["fetchHTMLBodyValues"] != true {
		t.Errorf("body values must be requested explicitly: %v", get.args)
	}
	if get.args["maxBodyValueBytes"] != float64(maxBodyValueBytes) {
		t.Errorf("maxBodyValueBytes not sent: %v", get.args)
	}
}

func TestGetMessage_NotFound(t *testing.T) {
	responses := resolution()
	responses["Email/get"] = `{"list":[]}`

	_, client, done := newFakeJMAP(t, responses)
	defer done()

	if _, err := client.GetMessage(context.Background(), "agent", "example.com", "missing"); err != ErrNotFound {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}

func TestSend(t *testing.T) {
	responses := resolution()
	responses["Identity/get"] = `{"list":[{"id":"i-other","email":"someone-else@example.com"},{"id":"i1","email":"AGENT@example.com"}]}`
	responses["Mailbox/query"] = `{"ids":["mb-drafts"]}`
	responses["Email/set"] = `{"created":{"e0":{"id":"e-new"}}}`
	responses["EmailSubmission/set"] = `{"created":{"s0":{"id":"s-new"}}}`

	fake, client, done := newFakeJMAP(t, responses)
	defer done()

	id, err := client.Send(context.Background(), "agent", "example.com", SendMessage{
		To:       []Address{{Email: "someone@example.com"}},
		CC:       []Address{{Email: "cc@example.com"}},
		Subject:  "Report",
		TextBody: "body text",
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if id != "e-new" {
		t.Errorf("id = %q, want the created message id", id)
	}

	set, ok := fake.call("Email/set")
	if !ok {
		t.Fatal("expected an Email/set call")
	}
	draft := set.args["create"].(map[string]any)["e0"].(map[string]any)
	from := draft["from"].([]any)[0].(map[string]any)
	if from["email"] != "agent@example.com" {
		t.Errorf("From must be the sending mailbox, got %v", from["email"])
	}
	if draft["subject"] != "Report" {
		t.Errorf("subject not passed through: %v", draft["subject"])
	}
	if _, hasHTML := draft["htmlBody"]; hasHTML {
		t.Error("no htmlBody was supplied, so none must be sent")
	}

	sub, ok := fake.call("EmailSubmission/set")
	if !ok {
		t.Fatal("expected an EmailSubmission/set call")
	}
	submission := sub.args["create"].(map[string]any)["s0"].(map[string]any)
	if submission["emailId"] != "e-new" {
		t.Errorf("submission must reference the created draft, got %v", submission["emailId"])
	}
	// Identity matching is case-insensitive, so the identity whose address
	// differs only in case must still be the one chosen.
	if submission["identityId"] != "i1" {
		t.Errorf("identityId = %v, want the mailbox's own identity", submission["identityId"])
	}
	envelope := submission["envelope"].(map[string]any)
	if envelope["mailFrom"].(map[string]any)["email"] != "agent@example.com" {
		t.Errorf("envelope mailFrom = %v", envelope["mailFrom"])
	}
	if rcpt := envelope["rcptTo"].([]any); len(rcpt) != 2 {
		t.Errorf("expected To and CC in the envelope, got %v", rcpt)
	}
	if _, ok := sub.args["onSuccessUpdateEmail"]; !ok {
		t.Error("a sent message must be filed out of Drafts")
	}
}

func TestSend_NoMatchingIdentity(t *testing.T) {
	responses := resolution()
	responses["Identity/get"] = `{"list":[{"id":"i-other","email":"someone-else@example.com"}]}`

	_, client, done := newFakeJMAP(t, responses)
	defer done()

	_, err := client.Send(context.Background(), "agent", "example.com", SendMessage{
		To:       []Address{{Email: "someone@example.com"}},
		TextBody: "hi",
	})
	if err == nil || !strings.Contains(err.Error(), "no send identity") {
		t.Fatalf("got %v, want a missing-identity error", err)
	}
}

func TestSend_RefusedSubmissionCleansUpDraft(t *testing.T) {
	responses := resolution()
	responses["Identity/get"] = `{"list":[{"id":"i1","email":"agent@example.com"}]}`
	responses["Mailbox/query"] = `{"ids":["mb-drafts"]}`
	responses["Email/set"] = `{"created":{"e0":{"id":"e-new"}}}`
	responses["EmailSubmission/set"] = `{"notCreated":{"s0":{"type":"forbiddenFrom"}}}`

	fake, client, done := newFakeJMAP(t, responses)
	defer done()

	_, err := client.Send(context.Background(), "agent", "example.com", SendMessage{
		To:       []Address{{Email: "someone@example.com"}},
		TextBody: "hi",
	})
	if err == nil {
		t.Fatal("expected a refused submission to be an error")
	}

	// The last Email/set must be the cleanup destroy, so a failed send
	// doesn't leave a draft sitting in the mailbox.
	var destroyed bool
	for _, c := range fake.calls {
		if c.method == "Email/set" && c.args["destroy"] != nil {
			destroyed = true
		}
	}
	if !destroyed {
		t.Error("expected the orphaned draft to be destroyed")
	}
}
