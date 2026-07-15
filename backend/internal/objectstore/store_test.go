package objectstore

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestNewObjectKey_NamespacedAndUnguessable(t *testing.T) {
	key1, err := NewObjectKey("cust-123", KindCSVExport, "mailboxes.csv")
	if err != nil {
		t.Fatalf("NewObjectKey: %v", err)
	}
	key2, err := NewObjectKey("cust-123", KindCSVExport, "mailboxes.csv")
	if err != nil {
		t.Fatalf("NewObjectKey: %v", err)
	}
	if key1 == key2 {
		t.Fatal("two keys for the same filename must not collide")
	}
	if !strings.HasPrefix(key1, "cust-123/csv-export/") {
		t.Fatalf("expected customer+kind namespaced key, got %q", key1)
	}
	owner, ok := OwnerFromKey(key1)
	if !ok || owner != "cust-123" {
		t.Fatalf("OwnerFromKey: got %q, %v", owner, ok)
	}
}

func TestNewObjectKey_RejectsEmptyCustomerID(t *testing.T) {
	if _, err := NewObjectKey("", KindReport, "x.csv"); err == nil {
		t.Fatal("expected an error for empty customerID")
	}
}

func TestSanitizeFilename_BlocksPathTraversal(t *testing.T) {
	key, err := NewObjectKey("cust-123", KindCSVExport, "../../etc/passwd")
	if err != nil {
		t.Fatalf("NewObjectKey: %v", err)
	}
	if strings.Contains(key, "..") || strings.Contains(key, "/etc/") {
		t.Fatalf("key must not contain path traversal segments: %q", key)
	}
}

func TestLocalStore_PutAndSignedURLRoundTrip(t *testing.T) {
	store, err := NewLocalStore(t.TempDir(), "http://localhost:8081/internal/dev-object-store")
	if err != nil {
		t.Fatalf("NewLocalStore: %v", err)
	}

	key, err := store.Put(context.Background(), "cust-abc", KindReport, "report.csv", "text/csv", strings.NewReader("a,b,c\n1,2,3\n"), 12)
	if err != nil {
		t.Fatalf("Put: %v", err)
	}

	signedURL, err := store.SignedGetURL(context.Background(), key, time.Minute)
	if err != nil {
		t.Fatalf("SignedGetURL: %v", err)
	}
	if !strings.Contains(signedURL, "sig=") || !strings.Contains(signedURL, "exp=") {
		t.Fatalf("expected a signed URL with sig/exp params, got %q", signedURL)
	}
}

func TestLocalStore_VerifyAndOpen_RejectsExpiredOrTamperedSignature(t *testing.T) {
	store, err := NewLocalStore(t.TempDir(), "http://localhost:8081/internal/dev-object-store")
	if err != nil {
		t.Fatalf("NewLocalStore: %v", err)
	}
	key, err := store.Put(context.Background(), "cust-abc", KindReport, "report.csv", "text/csv", strings.NewReader("data"), 4)
	if err != nil {
		t.Fatalf("Put: %v", err)
	}

	// Expired.
	pastExp := time.Now().Add(-time.Minute).Unix()
	sig := store.sign(key, pastExp)
	if _, err := store.VerifyAndOpen(key, itoa(pastExp), sig); err == nil {
		t.Fatal("expected expired signed URL to be rejected")
	}

	// Tampered signature.
	futureExp := time.Now().Add(time.Minute).Unix()
	if _, err := store.VerifyAndOpen(key, itoa(futureExp), "not-a-real-signature"); err == nil {
		t.Fatal("expected tampered signature to be rejected")
	}

	// Valid.
	validSig := store.sign(key, futureExp)
	f, err := store.VerifyAndOpen(key, itoa(futureExp), validSig)
	if err != nil {
		t.Fatalf("expected valid signed URL to open, got %v", err)
	}
	f.Close()
}

func itoa(v int64) string {
	return strconv.FormatInt(v, 10)
}
