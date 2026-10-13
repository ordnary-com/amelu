package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSEchoesOnlyAllowedOrigins(t *testing.T) {
	origins := []string{"https://app.amelu.org", "https://beta.amelu.org"}
	h := CORS(origins, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	for origin, want := range map[string]string{
		"https://beta.amelu.org": "https://beta.amelu.org",
		"https://app.amelu.org":  "https://app.amelu.org",
		"https://evil.example":   "https://app.amelu.org",
		"":                       "https://app.amelu.org",
	} {
		req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != want {
			t.Errorf("Origin %q: Access-Control-Allow-Origin = %q, want %q", origin, got, want)
		}
	}
}

func TestSafeReturnTo(t *testing.T) {
	for in, want := range map[string]string{
		"":                  "/domains",
		"/domains/abc":      "/domains/abc",
		"//evil.example":    "/domains",
		"/\\evil.example":   "/domains",
		"@evil.example":     "/domains",
		"https://evil.test": "/domains",
	} {
		if got := safeReturnTo(in); got != want {
			t.Errorf("safeReturnTo(%q) = %q, want %q", in, got, want)
		}
	}
}
