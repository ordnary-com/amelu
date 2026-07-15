package ordnaryauth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// Signed-cookie helpers, ported from ordnary-workspace's @ordnary/auth (and
// its Go port in services/nolan-core/internal/ordnaryauth) so the transient
// OAuth login state is carried the same way every other Ordnary app uses.

func createRandomString(size int) string {
	b := make([]byte, size)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// createPKCEPair returns a verifier and its S256 challenge.
func createPKCEPair() (verifier, challenge string) {
	verifier = createRandomString(32)
	sum := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(sum[:])
	return verifier, challenge
}

type cookieCodec struct {
	secret []byte
}

func newCookieCodec(secret string) cookieCodec {
	return cookieCodec{secret: []byte(secret)}
}

func (c cookieCodec) sign(value string) string {
	mac := hmac.New(sha256.New, c.secret)
	mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (c cookieCodec) encodeSigned(payload any) string {
	raw, _ := json.Marshal(payload)
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	return fmt.Sprintf("%s.%s", encoded, c.sign(encoded))
}

// decodeSigned verifies the HMAC and unmarshals into out. Returns false on
// any tamper/parse failure.
func (c cookieCodec) decodeSigned(value string, out any) bool {
	if value == "" {
		return false
	}
	parts := strings.SplitN(value, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return false
	}
	expected := c.sign(parts[0])
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[1])) != 1 {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	return json.Unmarshal(raw, out) == nil
}

type cookieOpts struct {
	maxAge     int
	httpOnly   bool
	production bool
}

func serializeCookie(name, value string, opts cookieOpts) string {
	parts := []string{fmt.Sprintf("%s=%s", name, value), "Path=/", "SameSite=Lax"}
	if opts.httpOnly {
		parts = append(parts, "HttpOnly")
	}
	if opts.maxAge != 0 {
		parts = append(parts, "Max-Age="+strconv.Itoa(opts.maxAge))
	}
	if opts.production {
		parts = append(parts, "Secure")
	}
	return strings.Join(parts, "; ")
}

func clearCookie(name string) string {
	return fmt.Sprintf("%s=; Path=/; Max-Age=0", name)
}

func getCookie(r *http.Request, name string) string {
	if c, err := r.Cookie(name); err == nil {
		return c.Value
	}
	return ""
}
