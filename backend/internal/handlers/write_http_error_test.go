package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWriteHTTPError(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		body   string
	}{
		{"validation", &httpError{status: http.StatusBadRequest, message: "localPart is required"}, http.StatusBadRequest, "localPart is required"},
		{"plan limit", &httpError{status: http.StatusForbidden, message: "mailbox limit reached for your plan"}, http.StatusForbidden, "mailbox limit reached"},
		{"upstream", &httpError{status: http.StatusBadGateway, message: "failed to create mailbox", cause: errors.New("boom")}, http.StatusBadGateway, "failed to create mailbox"},
		{"plain error", errors.New("unexpected"), http.StatusInternalServerError, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			writeHTTPError(rec, c.err)
			if rec.Code != c.status {
				t.Fatalf("status = %d, want %d", rec.Code, c.status)
			}
			if !strings.Contains(rec.Body.String(), c.body) {
				t.Fatalf("body = %q, want it to contain %q", rec.Body.String(), c.body)
			}
		})
	}
}
