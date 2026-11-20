package db

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"
)

// Runs against a throwaway Postgres: TEST_DATABASE_URL=postgres://... go test
func TestConnectorLifecycle(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	conn, err := Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := Migrate(ctx, conn); err != nil {
		t.Fatal(err)
	}
	s := NewStore(conn)

	var orgID string
	if err := conn.QueryRowContext(ctx, `INSERT INTO organizations (name) VALUES ('t') RETURNING id`).Scan(&orgID); err != nil {
		t.Fatal(err)
	}
	cust, err := s.CreateCustomer(ctx, "c@example.com", "C", "x", orgID, "C", "C", "ctest")
	if err != nil {
		t.Fatal(err)
	}
	dom, err := s.CreateDomain(ctx, cust.ID, "example.com", false)
	if err != nil {
		t.Fatal(err)
	}
	mb, err := s.CreateMailbox(ctx, dom.ID, "contact", "Contact")
	if err != nil {
		t.Fatal(err)
	}

	if err := s.CreateOAuthClient(ctx, "client1", "ChatGPT", []string{"https://a.example/cb", "https://b.example/cb"}); err != nil {
		t.Fatal(err)
	}
	cl, err := s.GetOAuthClient(ctx, "client1")
	if err != nil || len(cl.RedirectURIs) != 2 {
		t.Fatalf("client: %v %v", cl, err)
	}

	code := OAuthCode{ClientID: "client1", CustomerID: cust.ID, MailboxID: mb.ID, Scopes: []string{"mail.read", "mail.draft"}, RedirectURI: "https://a.example/cb", CodeChallenge: "chal"}
	if err := s.CreateOAuthCode(ctx, "codehash", code, time.Minute); err != nil {
		t.Fatal(err)
	}
	got, err := s.ConsumeOAuthCode(ctx, "codehash")
	if err != nil || len(got.Scopes) != 2 || got.MailboxID != mb.ID {
		t.Fatalf("consume: %+v %v", got, err)
	}
	if _, err := s.ConsumeOAuthCode(ctx, "codehash"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("code redeemable twice: %v", err)
	}

	if err := s.CreateConnectorToken(ctx, *got, "acc1", time.Hour, "ref1"); err != nil {
		t.Fatal(err)
	}
	grant, err := s.GetConnectorGrantByAccessHash(ctx, "acc1")
	if err != nil || grant.MailboxID != mb.ID || len(grant.Scopes) != 2 {
		t.Fatalf("grant: %+v %v", grant, err)
	}

	if _, err := s.RotateConnectorToken(ctx, "ref1", "otherclient", "acc2", time.Hour, "ref2"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rotated for wrong client: %v", err)
	}
	if _, err := s.RotateConnectorToken(ctx, "ref1", "client1", "acc2", time.Hour, "ref2"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetConnectorGrantByAccessHash(ctx, "acc1"); !errors.Is(err, ErrNotFound) {
		t.Fatal("old access token still valid after rotation")
	}
	if _, err := s.RotateConnectorToken(ctx, "ref1", "client1", "acc3", time.Hour, "ref3"); !errors.Is(err, ErrNotFound) {
		t.Fatal("old refresh token replayable")
	}

	list, err := s.ListConnectors(ctx, cust.ID)
	if err != nil || len(list) != 1 || list[0].MailboxAddr != "contact@example.com" || list[0].ClientName != "ChatGPT" {
		t.Fatalf("list: %+v %v", list, err)
	}
	if err := s.RevokeConnector(ctx, cust.ID, list[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetConnectorGrantByAccessHash(ctx, "acc2"); !errors.Is(err, ErrNotFound) {
		t.Fatal("revoked token still valid")
	}
}
