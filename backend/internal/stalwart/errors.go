package stalwart

import (
	"context"
	"errors"
	"fmt"
	"net"
)

// Kind says at which layer a call to Stalwart failed, so a handler can turn
// the failure into a stable error code without parsing error strings.
type Kind string

const (
	// KindTransport: the HTTP request never completed (dial, reset, EOF).
	KindTransport Kind = "transport"
	// KindTimeout: the request was cancelled or timed out.
	KindTimeout Kind = "timeout"
	// KindAuth: Stalwart answered 401/403 to the API credentials.
	KindAuth Kind = "auth"
	// KindHTTP: Stalwart answered any other non-200 status.
	KindHTTP Kind = "http"
	// KindProtocol: a 200 came back but the body wasn't a usable JMAP response.
	KindProtocol Kind = "protocol"
	// KindJMAP: Stalwart returned a JMAP error method response.
	KindJMAP Kind = "jmap"
)

// Error is what Client.call returns for anything that isn't a successful
// method response. Wrappers higher up add context with %w, so callers use
// errors.As to get at it.
type Error struct {
	Kind   Kind
	Method string
	// Status is the HTTP status for KindAuth/KindHTTP, zero otherwise.
	Status int
	// JMAPType is the JMAP error "type" for KindJMAP, e.g. "unknownMethod".
	JMAPType string
	Err      error
}

func (e *Error) Error() string {
	switch e.Kind {
	case KindTransport, KindTimeout:
		return fmt.Sprintf("%s: call stalwart: %v", e.Method, e.Err)
	case KindAuth, KindHTTP:
		return fmt.Sprintf("%s: stalwart returned HTTP %d: %v", e.Method, e.Status, e.Err)
	case KindJMAP:
		return fmt.Sprintf("%s: stalwart jmap error: %s: %v", e.Method, e.JMAPType, e.Err)
	default:
		return fmt.Sprintf("%s: %v", e.Method, e.Err)
	}
}

func (e *Error) Unwrap() error { return e.Err }

func transportError(method string, err error) *Error {
	kind := KindTransport
	var netErr net.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) ||
		(errors.As(err, &netErr) && netErr.Timeout()) {
		kind = KindTimeout
	}
	return &Error{Kind: kind, Method: method, Err: err}
}
