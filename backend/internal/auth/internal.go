package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"
)

// InternalAuthHeader carries "<unix-timestamp>.<hex hmac>", signed over
// "<method> <path>.<timestamp>" with the shared secret configured via
// INTERNAL_JOBS_SHARED_SECRET. This is for service-to-service calls only
// (Cloudflare Worker/Workflow -> Go origin over the private Tunnel
// hostname) - it is not a session and must never be reachable from the
// public internet directly. Cloudflare Access/Tunnel is the network
// boundary; this header is the application-layer boundary behind it,
// mirroring how the Stripe webhook signature is a second check behind
// CORS/network placement.
const InternalAuthHeader = "X-Amelu-Internal-Signature"

// internalAuthSkew bounds how old/futured a signed request can be, to
// limit the replay window if a signed header were ever intercepted.
const internalAuthSkew = 5 * time.Minute

// SignInternalRequest produces the header value a caller (Worker, ops
// script, test) should send for the given method+path at the given time.
// Exported so cloudflare/queues and integration tests can construct valid
// requests without duplicating the signing scheme.
func SignInternalRequest(secret, method, path string, at time.Time) string {
	ts := strconv.FormatInt(at.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(method + " " + path + "." + ts))
	return ts + "." + hex.EncodeToString(mac.Sum(nil))
}

// RequireInternal wraps an internal job handler with HMAC shared-secret
// verification. Unlike Require (customer sessions), there is no cookie and
// no customer in context - the caller is a trusted internal service, not a
// browser. If secret is empty the route always 503s rather than silently
// accepting unsigned requests, so a misconfigured deploy fails closed.
func RequireInternal(secret string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if secret == "" {
			http.Error(w, `{"error":"internal jobs are not configured"}`, http.StatusServiceUnavailable)
			return
		}

		got := r.Header.Get(InternalAuthHeader)
		ts, sig, ok := splitSignature(got)
		if !ok {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		sec, err := strconv.ParseInt(ts, 10, 64)
		if err != nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		at := time.Unix(sec, 0)
		if d := time.Since(at); d > internalAuthSkew || d < -internalAuthSkew {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		want := SignInternalRequest(secret, r.Method, r.URL.Path, at)
		_, wantSig, _ := splitSignature(want)
		if !hmac.Equal([]byte(sig), []byte(wantSig)) {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

func splitSignature(v string) (ts, sig string, ok bool) {
	for i := 0; i < len(v); i++ {
		if v[i] == '.' {
			return v[:i], v[i+1:], true
		}
	}
	return "", "", false
}
