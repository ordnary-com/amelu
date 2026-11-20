package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestValidRedirectURI(t *testing.T) {
	good := []string{"https://chatgpt.com/connector/oauth/abc", "http://localhost:8080/cb", "http://127.0.0.1/cb"}
	bad := []string{"http://evil.example/cb", "javascript:alert(1)", "https://x.example/cb#frag", "/relative", "https:///nohost", "ftp://x.example"}
	for _, u := range good {
		if !validRedirectURI(u) {
			t.Errorf("%q should be accepted", u)
		}
	}
	for _, u := range bad {
		if validRedirectURI(u) {
			t.Errorf("%q should be rejected", u)
		}
	}
}

func TestValidScopes(t *testing.T) {
	if got, ok := validScopes([]string{ScopeRead, ScopeRead, ScopeDraft}); !ok || len(got) != 2 {
		t.Fatalf("got %v %v", got, ok)
	}
	if _, ok := validScopes([]string{"mail.admin"}); ok {
		t.Fatal("unknown scope accepted")
	}
	if _, ok := validScopes(nil); ok {
		t.Fatal("empty scope list accepted")
	}
}

func TestAllowSendCapsPerToken(t *testing.T) {
	for i := 0; i < sendsPerHour; i++ {
		if !allowSend("tok-a") {
			t.Fatalf("send %d refused too early", i)
		}
	}
	if allowSend("tok-a") {
		t.Fatal("limit not enforced")
	}
	if !allowSend("tok-b") {
		t.Fatal("limit leaked across tokens")
	}
}

func TestMCPRequiresConnectorToken(t *testing.T) {
	app := &App{PublicAPIURL: "https://api.example"}
	for _, header := range []string{"", "Bearer amelu_live_apikeynotallowed", "Bearer garbage"} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/mcp", nil)
		if header != "" {
			r.Header.Set("Authorization", header)
		}
		app.MCP(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%q: status %d", header, w.Code)
		}
		if w.Header().Get("WWW-Authenticate") == "" {
			t.Fatalf("%q: missing WWW-Authenticate", header)
		}
	}
}
