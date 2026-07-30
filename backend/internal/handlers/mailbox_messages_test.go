package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"amelu/backend/internal/stalwart"
)

func TestToAddresses(t *testing.T) {
	cases := []struct {
		name    string
		in      []string
		want    []string
		wantErr bool
	}{
		{"plain", []string{"a@example.com", "b@example.com"}, []string{"a@example.com", "b@example.com"}, false},
		{"trims whitespace", []string{"  a@example.com  "}, []string{"a@example.com"}, false},
		{"skips empty entries", []string{"a@example.com", "", "   "}, []string{"a@example.com"}, false},
		{"rejects missing @", []string{"not-an-address"}, nil, true},
		// A newline in a recipient is the classic header injection attempt:
		// it must never reach the message builder.
		{"rejects embedded newline", []string{"a@example.com\nBcc: victim@example.com"}, nil, true},
		{"rejects carriage return", []string{"a@example.com\r\nSubject: x"}, nil, true},
		{"rejects comma-packed list", []string{"a@example.com,b@example.com"}, nil, true},
		{"rejects spaces", []string{"a@example.com b@example.com"}, nil, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := toAddresses(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected an error for %q", tc.in)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("got %d addresses, want %d (%+v)", len(got), len(tc.want), got)
			}
			for i := range got {
				if got[i].Email != tc.want[i] {
					t.Errorf("address %d = %q, want %q", i, got[i].Email, tc.want[i])
				}
			}
		})
	}
}

func TestFolderFromQuery(t *testing.T) {
	cases := []struct {
		query  string
		want   string
		wantOK bool
	}{
		{"", stalwart.RoleInbox, true},
		{"?folder=inbox", stalwart.RoleInbox, true},
		{"?folder=sent", stalwart.RoleSent, true},
		{"?folder=drafts", "", false},
		{"?folder=../inbox", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.query, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/mailboxes/x/messages"+tc.query, nil)
			got, ok := folderFromQuery(r)
			if ok != tc.wantOK || got != tc.want {
				t.Fatalf("got (%q, %v), want (%q, %v)", got, ok, tc.want, tc.wantOK)
			}
		})
	}
}
