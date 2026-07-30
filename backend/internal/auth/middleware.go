package auth

import (
	"context"
	"net/http"

	"amelu/backend/internal/db"
)

type contextKey int

const customerContextKey contextKey = 0

// Require resolves the caller to a customer and attaches it to the request
// context, accepting either the session cookie or an API key in
// "Authorization: Bearer" (see apikey.go). Responds 401 if neither is present
// or valid.
//
// A key acts as the customer that owns it, with that customer's organization
// role - there is no separate permission model for keys. What a key cannot do
// is reach the routes wrapped in RequireSession below.
func Require(store *db.Store, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if key, ok := APIKeyFromRequest(r); ok {
			customer, err := store.GetCustomerByAPIKeyHash(r.Context(), HashToken(key))
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			next(w, r.WithContext(context.WithValue(r.Context(), customerContextKey, customer)))
			return
		}
		requireSession(store, next)(w, r)
	}
}

// RequireSession is Require without the API key path: the caller must hold a
// session cookie. It guards the account surface (sign-in email, password,
// account termination) and API key management itself, so a leaked key can
// neither mint further keys nor take the account over - the blast radius of a
// key stops at the product API.
func RequireSession(store *db.Store, next http.HandlerFunc) http.HandlerFunc {
	return requireSession(store, next)
}

func requireSession(store *db.Store, next http.HandlerFunc) http.HandlerFunc {
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
