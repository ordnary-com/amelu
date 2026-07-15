package handlers

import (
	"net/http"

	"amelu/backend/internal/auth"
)

// EdgeAuth is defense-in-depth behind the Cloudflare Tunnel: it verifies
// every request carries a valid X-Origin-Shared-Secret header signed by
// the edge Worker (see cloudflare/edge/src/sign.ts), so that even if the
// private Tunnel hostname were ever reachable by something other than the
// Worker, the origin still rejects it. It is intentionally separate from
// auth.RequireInternal (different header, different secret/env var,
// different blast radius if one leaks) - see docs/cloudflare/SECRETS.md.
//
// secret == "" disables the check entirely (today's default: no Worker/
// Tunnel exists yet, `pnpm dev` talks to the Go backend directly). Once a
// deployment sits behind the Tunnel+Worker, ORIGIN_SHARED_SECRET must be
// set on both sides for this to fail closed.
//
// OPTIONS is always let through unsigned: browser CORS preflights are
// answered by the edge Worker itself and should never reach the origin at
// all in production, but this keeps local dev (frontend hitting :8081
// directly, no Worker in the loop) working unchanged.
func EdgeAuth(secret string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if secret == "" || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		if !auth.VerifySignedHeader(secret, r.Header.Get("X-Origin-Shared-Secret"), r.Method, r.URL.Path) {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next.ServeHTTP(w, r)
	})
}
