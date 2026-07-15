package objectstore

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// LocalStore is the local-dev/no-Cloudflare-account fallback: plain files
// under a root directory, with "signed" URLs that are just this same
// process's own HTTP server checking an HMAC query param - same shape as
// a real signed URL, so handler code doesn't need a dev-only branch, but
// obviously not a substitute for R2's actual access control in
// production. See docs/cloudflare/R2_STORAGE.md "Local dev fallback".
type LocalStore struct {
	root      string
	secret    []byte
	publicURL string // e.g. "http://localhost:8081/internal/dev-object-store"
}

func NewLocalStore(root, publicURL string) (*LocalStore, error) {
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("objectstore: create root dir: %w", err)
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, fmt.Errorf("objectstore: generate signing secret: %w", err)
	}
	return &LocalStore{root: root, secret: secret, publicURL: strings.TrimRight(publicURL, "/")}, nil
}

func (s *LocalStore) Put(_ context.Context, customerID string, kind Kind, filename, _ string, body io.Reader, _ int64) (string, error) {
	key, err := NewObjectKey(customerID, kind, filename)
	if err != nil {
		return "", err
	}
	path := filepath.Join(s.root, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", fmt.Errorf("objectstore: create object dir: %w", err)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return "", fmt.Errorf("objectstore: create object file: %w", err)
	}
	defer f.Close()
	if _, err := io.Copy(f, body); err != nil {
		return "", fmt.Errorf("objectstore: write object: %w", err)
	}
	return key, nil
}

func (s *LocalStore) SignedGetURL(_ context.Context, key string, expiresIn time.Duration) (string, error) {
	exp := time.Now().Add(expiresIn).Unix()
	sig := s.sign(key, exp)
	q := url.Values{"key": {key}, "exp": {strconv.FormatInt(exp, 10)}, "sig": {sig}}
	return s.publicURL + "?" + q.Encode(), nil
}

func (s *LocalStore) Delete(_ context.Context, key string) error {
	path := filepath.Join(s.root, filepath.FromSlash(key))
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("objectstore: delete object: %w", err)
	}
	return nil
}

// VerifyAndOpen validates a signed URL's query params (as produced by
// SignedGetURL) and, if valid and unexpired, opens the underlying file.
// The dev-only HTTP handler serving these URLs calls this - see
// docs/cloudflare/R2_STORAGE.md for why production never has an
// equivalent handler (R2 mints real presigned URLs, Cloudflare serves the
// download directly, this Go process is never in that path).
func (s *LocalStore) VerifyAndOpen(key, expStr, sig string) (*os.File, error) {
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("objectstore: invalid exp")
	}
	if time.Now().Unix() > exp {
		return nil, fmt.Errorf("objectstore: signed URL expired")
	}
	if !hmac.Equal([]byte(sig), []byte(s.sign(key, exp))) {
		return nil, fmt.Errorf("objectstore: invalid signature")
	}
	return os.Open(filepath.Join(s.root, filepath.FromSlash(key)))
}

func (s *LocalStore) sign(key string, exp int64) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(key + "." + strconv.FormatInt(exp, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

var _ Store = (*LocalStore)(nil)
