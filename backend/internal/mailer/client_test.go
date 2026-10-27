package mailer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSendEmailPostsToTheRelay(t *testing.T) {
	var got sendRequest
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode: %v", err)
		}
		_, _ = w.Write([]byte(`{"id":"cf_1"}`))
	}))
	defer relay.Close()

	id, err := NewClient(relay.URL, "onboarding@ordnary.com", "Amelu").
		SendEmail(context.Background(), "a@example.com", "Set up your password", "<p>x</p>", "x")
	if err != nil {
		t.Fatalf("SendEmail: %v", err)
	}
	if id != "cf_1" {
		t.Errorf("id = %q, want cf_1", id)
	}
	want := sendRequest{FromEmail: "onboarding@ordnary.com", FromName: "Amelu", To: "a@example.com", Subject: "Set up your password", HTML: "<p>x</p>", Text: "x"}
	if got != want {
		t.Errorf("relay got %+v, want %+v", got, want)
	}
}

func TestSendEmailReportsRelayErrors(t *testing.T) {
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"code":"E_DAILY_LIMIT_EXCEEDED","error":"Daily quota reached"}`))
	}))
	defer relay.Close()

	_, err := NewClient(relay.URL, "onboarding@ordnary.com", "Amelu").
		SendEmail(context.Background(), "a@example.com", "s", "h", "t")
	if err == nil || !strings.Contains(err.Error(), "E_DAILY_LIMIT_EXCEEDED") {
		t.Fatalf("err = %v, want the relay's error code in it", err)
	}
}
