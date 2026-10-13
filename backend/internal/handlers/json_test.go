package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"syscall"
	"testing"

	"amelu/backend/internal/stalwart"
)

func TestDescribeUpstream(t *testing.T) {
	reset := &url.Error{Op: "Post", URL: "http://marduk.mx.amelu.org:8080/jmap", Err: &net.OpError{
		Op: "read", Net: "tcp", Err: os.NewSyscallError("read", syscall.ECONNRESET),
	}}
	cases := []struct {
		err        error
		code       string
		wantReason string
	}{
		{fmt.Errorf("query domain x: %w", &stalwart.Error{Kind: stalwart.KindTransport, Method: "principal/query", Err: reset}),
			codeMailClusterUnreachable, "mail cluster unreachable (connection reset by peer)"},
		{&stalwart.Error{Kind: stalwart.KindAuth, Method: "principal/get", Status: 401, Err: errors.New("")},
			codeMailClusterAuth, "mail cluster rejected the API credentials (HTTP 401)"},
		{&stalwart.Error{Kind: stalwart.KindJMAP, Method: "principal/set", JMAPType: "invalidArguments", Err: errors.New("bad name")},
			codeMailClusterRejected, "mail cluster rejected principal/set: invalidArguments (bad name)"},
		{fmt.Errorf("domain x: %w", stalwart.ErrNotFound), codeMailClusterNotFound, "object not found in mail cluster"},
		{errors.New("resend: 500"), codeBadGateway, "resend: 500"},
	}
	for _, c := range cases {
		code, reason := describeUpstream(c.err)
		if code != c.code || reason != c.wantReason {
			t.Errorf("%v: got (%s, %q), want (%s, %q)", c.err, code, reason, c.code, c.wantReason)
		}
	}
}

func TestWriteUpstreamErrorBody(t *testing.T) {
	rec := httptest.NewRecorder()
	rec.Header().Set("X-Request-ID", "abc123")
	err := fmt.Errorf("query domain x: %w", &stalwart.Error{Kind: stalwart.KindTransport, Method: "principal/query",
		Err: &url.Error{Op: "Post", URL: "http://marduk:8080/jmap", Err: syscall.ECONNRESET}})
	writeUpstreamError(rec, "could not fetch expected DNS records from mail cluster", err)

	var body apiError
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	want := "could not fetch expected DNS records from mail cluster: mail cluster unreachable (connection reset by peer). See https://amelu.org/docs/errors#MAIL_CLUSTER_UNREACHABLE"
	if body.Error != want {
		t.Errorf("error = %q, want %q", body.Error, want)
	}
	if body.Code != codeMailClusterUnreachable || body.Status != 502 || body.RequestID != "abc123" {
		t.Errorf("code/status/requestId = %s/%d/%s", body.Code, body.Status, body.RequestID)
	}
	if !strings.Contains(body.Detail, "marduk:8080") {
		t.Errorf("detail should carry the full chain, got %q", body.Detail)
	}
}
