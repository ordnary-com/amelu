package db

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"
)

// testStore connects to the Postgres instance named by DATABASE_URL and
// applies migrations, same as cmd/api/main.go does at startup. Skipped
// entirely when DATABASE_URL isn't set (e.g. in CI, which doesn't
// provision Postgres for the Go job) - run these locally with a real
// database to exercise them: DATABASE_URL=... go test ./internal/db/...
func testStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set, skipping database-backed test")
	}
	conn, err := Open(dsn)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if err := Migrate(context.Background(), conn); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return NewStore(conn)
}

func randomSuffix(t *testing.T) string {
	t.Helper()
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		t.Fatalf("random suffix: %v", err)
	}
	return hex.EncodeToString(b)
}

// newTestOrgWithOwner creates a fresh organization with one owner customer,
// mirroring what Signup does, and registers cleanup that deletes the
// organization (cascading to its members/customers/invitations/audit log).
func newTestOrgWithOwner(t *testing.T, s *Store) (orgID string, ownerID string) {
	t.Helper()
	ctx := context.Background()
	suffix := randomSuffix(t)

	org, err := s.CreateOrganization(ctx, "Test Org "+suffix)
	if err != nil {
		t.Fatalf("create organization: %v", err)
	}
	t.Cleanup(func() {
		s.conn.ExecContext(context.Background(), `DELETE FROM organizations WHERE id = $1`, org.ID)
	})

	owner, err := s.CreateCustomer(ctx, "owner-"+suffix+"@example.com", "Owner", "hash", org.ID, "Owner", "Test", "owner"+suffix)
	if err != nil {
		t.Fatalf("create owner customer: %v", err)
	}
	if err := s.AddOrganizationMember(ctx, org.ID, owner.ID, RoleOwner); err != nil {
		t.Fatalf("add owner member: %v", err)
	}
	return org.ID, owner.ID
}

func newTestMember(t *testing.T, s *Store, orgID, role string) string {
	t.Helper()
	ctx := context.Background()
	suffix := randomSuffix(t)
	c, err := s.CreateCustomer(ctx, role+"-"+suffix+"@example.com", "Member", "hash", orgID, "Member", "Test", role+suffix)
	if err != nil {
		t.Fatalf("create member customer: %v", err)
	}
	if err := s.AddOrganizationMember(ctx, orgID, c.ID, role); err != nil {
		t.Fatalf("add member: %v", err)
	}
	return c.ID
}
