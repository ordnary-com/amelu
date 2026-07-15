package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"
)

// AdminSignatureHeader/AdminOperatorHeader authenticate Helm (Ordnary's
// internal admin console) calling into Amelu's cross-customer admin API.
// Unlike InternalAuthHeader (trusted service, no human on the other end),
// every admin call is made on behalf of a specific staff member - the
// operator header carries their Ordnary account email, and it's signed
// together with the method/path so it can't be swapped independently of the
// signature. helm-api verifies the staff member's own session and IAM
// permission before ever minting this signature; this header only proves
// "helm-api vouches this request is really from <operator>", for Amelu's own
// audit log (every admin write is logged as "[admin:<operator>] ...").
const (
	AdminSignatureHeader = "X-Amelu-Admin-Signature"
	AdminOperatorHeader  = "X-Amelu-Admin-Operator"
)

const adminAuthSkew = 5 * time.Minute

// SignAdminRequest produces the header value for a given method+path+operator
// at the given time. Exported so helm-api and tests can construct valid
// requests without duplicating the signing scheme.
func SignAdminRequest(secret, method, path, operator string, at time.Time) string {
	ts := strconv.FormatInt(at.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(method + " " + path + " " + operator + "." + ts))
	return ts + "." + hex.EncodeToString(mac.Sum(nil))
}

func verifyAdminSignedHeader(secret, headerValue, method, path, operator string) bool {
	ts, sig, ok := splitSignature(headerValue)
	if !ok {
		return false
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return false
	}
	at := time.Unix(sec, 0)
	if d := time.Since(at); d > adminAuthSkew || d < -adminAuthSkew {
		return false
	}
	want := SignAdminRequest(secret, method, path, operator, at)
	_, wantSig, _ := splitSignature(want)
	return hmac.Equal([]byte(sig), []byte(wantSig))
}

// RequireAdmin wraps a cross-customer admin handler with HMAC verification
// that binds the calling operator's identity into the signature. If secret
// is empty the route always 503s rather than silently accepting unsigned
// requests, so a misconfigured deploy fails closed - same convention as
// RequireInternal. The verified operator (an Ordnary staff email) is passed
// through to the handler for audit logging.
func RequireAdmin(secret string, next func(w http.ResponseWriter, r *http.Request, operator string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if secret == "" {
			http.Error(w, `{"error":"admin API is not configured"}`, http.StatusServiceUnavailable)
			return
		}
		operator := r.Header.Get(AdminOperatorHeader)
		if operator == "" || !verifyAdminSignedHeader(secret, r.Header.Get(AdminSignatureHeader), r.Method, r.URL.Path, operator) {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r, operator)
	}
}
