package db

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestDomainActions(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	_, ownerID := newTestOrgWithOwner(t, s)
	// The organization's cleanup can't remove its customers (no cascade); the domain goes with its owner.
	t.Cleanup(func() { s.conn.ExecContext(context.Background(), `DELETE FROM customers WHERE id = $1`, ownerID) })
	name := "actions-" + randomSuffix(t) + ".example"
	dom, err := s.CreateDomain(ctx, ownerID, name, false)
	if err != nil {
		t.Fatalf("domain: %v", err)
	}

	if _, err := s.GetVerifiedDomainIDByName(ctx, name); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an unverified domain isn't on marduk, got %v", err)
	}
	if err := s.MarkDomainOwnershipVerified(ctx, dom.ID); err != nil {
		t.Fatalf("verify: %v", err)
	}
	if id, err := s.GetVerifiedDomainIDByName(ctx, "ACTIONS-"+name[len("actions-"):]); err != nil || id != dom.ID {
		t.Fatalf("lookup by name ignoring case: %q %v", id, err)
	}

	paused := time.Date(2026, 11, 18, 18, 17, 0, 0, time.UTC)
	if created, err := s.RecordDomainAction(ctx, dom.ID, "sending_paused", "8 recipients that don't exist", "sender_guard", paused); err != nil || !created {
		t.Fatalf("record: %v %v", created, err)
	}
	if created, err := s.RecordDomainAction(ctx, dom.ID, "sending_paused", "again", "sender_guard", paused.Add(time.Hour)); err != nil || created {
		t.Fatalf("a second report while one is open should be a no-op: %v %v", created, err)
	}
	open, err := s.OpenDomainAction(ctx, dom.ID, "sending_paused")
	if err != nil || open.Reason != "8 recipients that don't exist" || !open.CreatedAt.Equal(paused) {
		t.Fatalf("open action: %+v %v", open, err)
	}

	lifted := paused.Add(19 * time.Hour)
	if ok, err := s.LiftDomainAction(ctx, dom.ID, "sending_paused", "staff", lifted); err != nil || !ok {
		t.Fatalf("lift: %v %v", ok, err)
	}
	if ok, err := s.LiftDomainAction(ctx, dom.ID, "sending_paused", "staff", lifted); err != nil || ok {
		t.Fatalf("lifting twice should find nothing open: %v %v", ok, err)
	}
	if _, err := s.OpenDomainAction(ctx, dom.ID, "sending_paused"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("nothing should be open, got %v", err)
	}

	later := lifted.Add(48 * time.Hour)
	if created, err := s.RecordDomainAction(ctx, dom.ID, "sending_paused", "41 recipient domains", "sender_guard", later); err != nil || !created {
		t.Fatalf("a new pause after a lift: %v %v", created, err)
	}
	list, err := s.ListDomainActions(ctx, dom.ID, 20)
	if err != nil || len(list) != 2 {
		t.Fatalf("list: %+v %v", list, err)
	}
	if !list[0].CreatedAt.Equal(later) || list[0].LiftedAt.Valid || !list[1].LiftedAt.Valid || list[1].LiftedBy.String != "staff" {
		t.Fatalf("newest first, only the old one lifted: %+v", list)
	}
	if _, err := s.RecordDomainAction(ctx, dom.ID, "something_else", "", "staff", later); err == nil {
		t.Fatal("an unknown kind should be refused")
	}

	if suspended, err := s.CustomerSuspended(ctx, ownerID); err != nil || suspended {
		t.Fatalf("suspended: %v %v", suspended, err)
	}
	if _, err := s.conn.ExecContext(ctx, `UPDATE customers SET suspended_at = now(), suspended_reason = 'internal note' WHERE id = $1`, ownerID); err != nil {
		t.Fatal(err)
	}
	if suspended, err := s.CustomerSuspended(ctx, ownerID); err != nil || !suspended {
		t.Fatalf("suspended after setting it: %v %v", suspended, err)
	}
}
