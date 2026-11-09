package handlers

import (
	"net/http"
	"regexp"
)

// /api/domains/{id} and everything under it, with the id a UUID ("order" isn't one).
var domainPath = regexp.MustCompile(`^/api/domains/([0-9a-fA-F-]{36})(/.*)?$`)

// What an unverified domain may still do: be looked at, verified, deleted,
// starred and show its own activity. Everything else reaches into Stalwart,
// where an unverified domain doesn't exist.
var unverifiedDomainPaths = map[string]bool{
	"":                  true,
	"/verify-ownership": true,
	"/favorite":         true,
	"/activity":         true,
}

// GuardUnverifiedDomains refuses every other domain endpoint until the
// domain's ownership is verified, in one place instead of in each handler.
// Who may see the domain at all is still up to the handlers themselves.
func (a *App) GuardUnverifiedDomains(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m := domainPath.FindStringSubmatch(r.URL.Path)
		if m == nil || unverifiedDomainPaths[m[2]] {
			next.ServeHTTP(w, r)
			return
		}
		if status, err := a.Store.DomainStatus(r.Context(), m[1]); err == nil && status == "unverified" {
			writeError(w, http.StatusConflict, "verify that you own this domain first")
			return
		}
		next.ServeHTTP(w, r)
	})
}
