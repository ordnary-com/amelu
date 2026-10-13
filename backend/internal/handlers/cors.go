package handlers

import (
	"net/http"
	"slices"
)

// CORS allows the configured frontend origins to call this API with
// credentials (cookies). Access-Control-Allow-Origin can't be "*" when
// credentials are involved, so it echoes the request's Origin only when that
// origin is on the list, and the first configured origin otherwise.
func CORS(origins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		allowed := origins[0]
		if origin := r.Header.Get("Origin"); slices.Contains(origins, origin) {
			allowed = origin
		}
		w.Header().Set("Access-Control-Allow-Origin", allowed)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-File-Name")
		w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
		w.Header().Add("Vary", "Origin")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
