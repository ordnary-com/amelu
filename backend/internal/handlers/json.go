package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"amelu/backend/internal/stalwart"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		if err := json.NewEncoder(w).Encode(v); err != nil {
			log.Printf("write json response: %v", err)
		}
	}
}

// apiError is the body of every non-2xx JSON response. `error` is the
// sentence shown to the customer; `code` is stable and safe to match on;
// `detail` is the full underlying error chain (internal hostnames included)
// and only present for upstream failures; `requestId` ties the response to
// the matching server log line.
type apiError struct {
	Error     string `json:"error"`
	Code      string `json:"code"`
	Status    int    `json:"status"`
	RequestID string `json:"requestId,omitempty"`
	Detail    string `json:"detail,omitempty"`
}

// Generic codes, derived from the status when a handler doesn't name one.
const (
	codeBadRequest         = "BAD_REQUEST"
	codeUnauthorized       = "UNAUTHORIZED"
	codeForbidden          = "FORBIDDEN"
	codeNotFound           = "NOT_FOUND"
	codeConflict           = "CONFLICT"
	codeInternal           = "INTERNAL_ERROR"
	codeBadGateway         = "UPSTREAM_ERROR"
	codeServiceUnavailable = "SERVICE_UNAVAILABLE"

	codeMailClusterUnreachable = "MAIL_CLUSTER_UNREACHABLE"
	codeMailClusterTimeout     = "MAIL_CLUSTER_TIMEOUT"
	codeMailClusterAuth        = "MAIL_CLUSTER_AUTH"
	codeMailClusterHTTP        = "MAIL_CLUSTER_HTTP_ERROR"
	codeMailClusterProtocol    = "MAIL_CLUSTER_PROTOCOL"
	codeMailClusterRejected    = "MAIL_CLUSTER_REJECTED"
	codeMailClusterNotFound    = "MAIL_CLUSTER_NOT_FOUND"
)

func codeForStatus(status int) string {
	switch status {
	case http.StatusBadRequest:
		return codeBadRequest
	case http.StatusUnauthorized:
		return codeUnauthorized
	case http.StatusForbidden:
		return codeForbidden
	case http.StatusNotFound:
		return codeNotFound
	case http.StatusConflict:
		return codeConflict
	case http.StatusInternalServerError:
		return codeInternal
	case http.StatusBadGateway:
		return codeBadGateway
	case http.StatusServiceUnavailable:
		return codeServiceUnavailable
	default:
		return "HTTP_" + strconv.Itoa(status)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeErrorCode(w, status, codeForStatus(status), message, "")
}

// errorDocsURL is where every code is explained; the link is part of the
// error sentence itself (the way Google's APIs do it) so it survives being
// copied into a support ticket as plain text.
const errorDocsURL = "https://amelu.org/docs/errors"

func writeErrorCode(w http.ResponseWriter, status int, code, message, detail string) {
	requestID := w.Header().Get("X-Request-ID")
	// Only faults the customer can't fix by changing their input get the
	// reference link; "username is required" doesn't need one.
	if status >= 500 {
		message = strings.TrimRight(message, ". ") + ". See " + errorDocsURL + "#" + code
	}
	if status >= 500 {
		if detail != "" {
			log.Printf("[%s] %d %s: %s: %s", requestID, status, code, message, detail)
		} else {
			log.Printf("[%s] %d %s: %s", requestID, status, code, message)
		}
	}
	writeJSON(w, status, apiError{
		Error:     message,
		Code:      code,
		Status:    status,
		RequestID: requestID,
		Detail:    detail,
	})
}

// writeUpstreamError reports a failed call to the mail cluster (or another
// upstream) as a 502 with a code that says *how* it failed. `what` is the
// action from the customer's point of view ("could not fetch DNS records");
// the response reads "<what>: mail cluster unreachable (connection reset by
// peer)" with the full error chain in `detail`.
func writeUpstreamError(w http.ResponseWriter, what string, err error) {
	code, reason := describeUpstream(err)
	message := reason
	if what != "" {
		message = what + ": " + reason
	}
	writeErrorCode(w, http.StatusBadGateway, code, message, err.Error())
}

// upstreamReason is the one-line form for per-row results (CSV import,
// bulk alias create): "<message>: <reason> [CODE]".
func upstreamReason(err error) string {
	var he *httpError
	if errors.As(err, &he) {
		if he.cause == nil {
			return he.message
		}
		code, reason := describeUpstream(he.cause)
		return he.message + ": " + reason + " [" + code + "]"
	}
	code, reason := describeUpstream(err)
	return reason + " [" + code + "]"
}

// describeUpstream maps an error from the stalwart package (or anything
// else) to an error code and a short technical reason without internal
// addresses.
func describeUpstream(err error) (code, reason string) {
	if errors.Is(err, stalwart.ErrNotFound) {
		return codeMailClusterNotFound, "object not found in mail cluster"
	}
	var se *stalwart.Error
	if !errors.As(err, &se) {
		return codeBadGateway, err.Error()
	}
	switch se.Kind {
	case stalwart.KindTransport:
		return codeMailClusterUnreachable, "mail cluster unreachable (" + rootCause(se.Err) + ")"
	case stalwart.KindTimeout:
		return codeMailClusterTimeout, "mail cluster timed out (" + rootCause(se.Err) + ")"
	case stalwart.KindAuth:
		return codeMailClusterAuth, "mail cluster rejected the API credentials (HTTP " + strconv.Itoa(se.Status) + ")"
	case stalwart.KindHTTP:
		return codeMailClusterHTTP, "mail cluster returned HTTP " + strconv.Itoa(se.Status) + " on " + se.Method
	case stalwart.KindProtocol:
		return codeMailClusterProtocol, "mail cluster sent an unreadable response on " + se.Method + " (" + rootCause(se.Err) + ")"
	case stalwart.KindJMAP:
		return codeMailClusterRejected, "mail cluster rejected " + se.Method + ": " + se.JMAPType + " (" + se.Err.Error() + ")"
	}
	return codeBadGateway, err.Error()
}

// rootCause is the innermost error in a chain: for a failed HTTP call that
// is the syscall text ("connection reset by peer") rather than the
// url.Error that spells out the internal host and ports.
func rootCause(err error) string {
	for {
		next := errors.Unwrap(err)
		if next == nil {
			return err.Error()
		}
		err = next
	}
}

// RequestID gives every request an id, echoed in the X-Request-ID response
// header and in error bodies, so a customer can quote one and it can be
// found in the logs. An id passed in by the edge is kept.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			var b [8]byte
			rand.Read(b[:])
			id = hex.EncodeToString(b[:])
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r)
	})
}

func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}
