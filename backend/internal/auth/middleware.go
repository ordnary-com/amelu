package auth

import (
	"context"
	"net/http"

	"amelu/backend/internal/db"
)

type contextKey int

const customerContextKey contextKey = 0

// Require looks up the session cookie, resolves it to a customer via store,
// and attaches the customer to the request context. Responds 401 if the
// cookie is missing, invalid, or expired.
func Require(store *db.Store, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := TokenFromRequest(r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		customer, err := store.GetCustomerBySessionToken(r.Context(), HashToken(token))
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), customerContextKey, customer)
		next(w, r.WithContext(ctx))
	}
}

func CustomerFromContext(ctx context.Context) (*db.Customer, bool) {
	c, ok := ctx.Value(customerContextKey).(*db.Customer)
	return c, ok
}
