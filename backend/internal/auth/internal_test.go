package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRequireInternal_ValidSignature(t *testing.T) {
	secret := "test-secret"
	called := false
	handler := RequireInternal(secret, func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expiration-sweep", nil)
	req.Header.Set(InternalAuthHeader, SignInternalRequest(secret, req.Method, req.URL.Path, time.Now()))
	rec := httptest.NewRecorder()
	handler(rec, req)

	if !called || rec.Code != http.StatusOK {
		t.Fatalf("expected handler to run with 200, got called=%v code=%d", called, rec.Code)
	}
}

func TestRequireInternal_WrongSecret(t *testing.T) {
	handler := RequireInternal("real-secret", func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler must not run with an invalid signature")
	})

	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expiration-sweep", nil)
	req.Header.Set(InternalAuthHeader, SignInternalRequest("wrong-secret", req.Method, req.URL.Path, time.Now()))
	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestRequireInternal_StalePastSignatureRejected(t *testing.T) {
	secret := "test-secret"
	handler := RequireInternal(secret, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler must not run with a stale signature")
	})

	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expiration-sweep", nil)
	req.Header.Set(InternalAuthHeader, SignInternalRequest(secret, req.Method, req.URL.Path, time.Now().Add(-10*time.Minute)))
	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for stale signature, got %d", rec.Code)
	}
}

func TestRequireInternal_WrongPathRejected(t *testing.T) {
	secret := "test-secret"
	handler := RequireInternal(secret, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler must not run when the signed path doesn't match")
	})

	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expiration-sweep", nil)
	req.Header.Set(InternalAuthHeader, SignInternalRequest(secret, req.Method, "/internal/jobs/other-job", time.Now()))
	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for mismatched path, got %d", rec.Code)
	}
}

func TestRequireInternal_EmptySecretFailsClosed(t *testing.T) {
	handler := RequireInternal("", func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler must not run when no secret is configured")
	})

	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expiration-sweep", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when unconfigured, got %d", rec.Code)
	}
}

func TestRequireInternal_MissingHeaderRejected(t *testing.T) {
	handler := RequireInternal("test-secret", func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler must not run without a signature header")
	})

	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expiration-sweep", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
