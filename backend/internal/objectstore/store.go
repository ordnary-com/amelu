// Package objectstore is the async-export/report side of Amelu's storage -
// CSV exports, generated reports, support bundles, optional encrypted
// backups. It is NEVER used for live mailbox storage (that stays on
// Stalwart's own disk, unrelated to this package) - see
// docs/cloudflare/R2_STORAGE.md for the full design and why.
//
// Store is implemented by LocalStore (see local.go, used in local dev and
// as the default until R2 credentials exist) and, once provisioned, an R2
// implementation described in docs/cloudflare/R2_STORAGE.md - not
// implemented in Go here yet, since that needs a real Cloudflare account
// and bucket to test against (see config.Load's convention of "missing
// config = feature unavailable", which an R2Store constructor would
// follow the same way Resend/Stripe/DomainConnect already do).
package objectstore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"strings"
	"time"
)

// Kind groups objects for lifecycle/retention purposes - see
// docs/cloudflare/R2_STORAGE.md "Retention" for the actual TTL per kind.
type Kind string

const (
	KindCSVExport      Kind = "csv-export"
	KindImportTemp     Kind = "import-temp"
	KindReport         Kind = "report"
	KindSupportBundle  Kind = "support-bundle"
	KindEncryptedBackup Kind = "encrypted-backup"
)

// Store is the interface handlers depend on - never *R2Store or
// *LocalStore directly, so the Cloudflare migration is a config change
// (which implementation config.Load wires up), not a handler rewrite.
type Store interface {
	// Put writes an object and returns its opaque key. Callers never
	// choose the key themselves - see NewObjectKey - so a customer can
	// never guess or collide with another customer's object path.
	Put(ctx context.Context, customerID string, kind Kind, filename string, contentType string, body io.Reader, size int64) (key string, err error)

	// SignedGetURL mints a short-lived, single-object download URL. The Go
	// backend is always the one minting it (never a bucket made public) -
	// see docs/cloudflare/R2_STORAGE.md "Authenticated download".
	SignedGetURL(ctx context.Context, key string, expiresIn time.Duration) (string, error)

	// Delete is used both for explicit cleanup and to back a lifecycle
	// rule that isn't configured server-side (e.g. local dev, which has no
	// R2 lifecycle engine).
	Delete(ctx context.Context, key string) error
}

// NewObjectKey builds a non-guessable, customer-namespaced key:
// "<customerID>/<kind>/<random-uuid>-<sanitized-filename>". The random
// segment (not the filename or any user input) is what makes a key
// unguessable - filenames are kept only for a friendly download name, and
// customerID prefixing is what a bucket-level or application-level authz
// check keys off (see docs/cloudflare/R2_STORAGE.md "Customer
// separation").
func NewObjectKey(customerID string, kind Kind, filename string) (string, error) {
	if customerID == "" {
		return "", fmt.Errorf("objectstore: customerID is required")
	}
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("objectstore: generate random key segment: %w", err)
	}
	return fmt.Sprintf("%s/%s/%s-%s", customerID, kind, hex.EncodeToString(b), sanitizeFilename(filename)), nil
}

// sanitizeFilename strips path separators and leading dots so a
// caller-supplied filename can never be used for path traversal or to
// overwrite an unrelated key - it only ever contributes a cosmetic suffix.
func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	name = strings.ReplaceAll(name, "..", "_")
	name = strings.TrimLeft(name, ".")
	if name == "" {
		return "file"
	}
	if len(name) > 128 {
		name = name[:128]
	}
	return name
}

// OwnerFromKey extracts the customerID namespace prefix from a key, for
// the authz check every download handler must perform: the requesting
// customer's ID must equal OwnerFromKey(key) before SignedGetURL is ever
// called - see docs/cloudflare/R2_STORAGE.md "Customer separation".
func OwnerFromKey(key string) (customerID string, ok bool) {
	idx := strings.Index(key, "/")
	if idx <= 0 {
		return "", false
	}
	return key[:idx], true
}
