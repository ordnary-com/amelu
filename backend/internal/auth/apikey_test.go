package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewAPIKey_PrefixAndHash(t *testing.T) {
	raw, hash, prefix, err := NewAPIKey()
	if err != nil {
		t.Fatalf("NewAPIKey: %v", err)
	}
	if !strings.HasPrefix(raw, KeyPrefix) {
		t.Fatalf("raw key %q missing prefix %q", raw, KeyPrefix)
	}
	if !strings.HasPrefix(raw, prefix) {
		t.Fatalf("display prefix %q is not a prefix of the key", prefix)
	}
	if len(prefix) != len(KeyPrefix)+prefixRandomChars {
		t.Fatalf("prefix %q has unexpected length %d", prefix, len(prefix))
	}
	if hash != HashToken(raw) {
		t.Fatal("returned hash does not match HashToken of the raw key")
	}
	if strings.Contains(hash, raw) {
		t.Fatal("hash must not contain the raw key")
	}

	other, _, _, err := NewAPIKey()
	if err != nil {
		t.Fatalf("NewAPIKey: %v", err)
	}
	if other == raw {
		t.Fatal("two generated keys must not be identical")
	}
}

func TestAPIKeyFromRequest(t *testing.T) {
	cases := []struct {
		name   string
		header string
		want   string
		wantOK bool
	}{
		{"no header", "", "", false},
		{"bearer amelu key", "Bearer " + KeyPrefix + "abc123", KeyPrefix + "abc123", true},
		{"some other bearer token", "Bearer github_pat_abc", "", false},
		{"basic auth", "Basic dXNlcjpwYXNz", "", false},
		{"missing bearer scheme", KeyPrefix + "abc123", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/domains", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			got, ok := APIKeyFromRequest(req)
			if ok != tc.wantOK || got != tc.want {
				t.Fatalf("got (%q, %v), want (%q, %v)", got, ok, tc.want, tc.wantOK)
			}
		})
	}
}
