package auth

import (
	"encoding/json"
	"net/http"
)

// writeError mirrors handlers.writeError (which can't be imported from here
// without a cycle): the same {error, code, status, requestId} body, so a
// 401 from the middleware looks like every other API error.
func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{
		"error":     message,
		"code":      code,
		"status":    status,
		"requestId": w.Header().Get("X-Request-ID"),
	})
}
