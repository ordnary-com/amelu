package db

import (
	"context"
	"errors"
	"testing"
)

func TestDedicatedIPRequestFlow(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)

	d, err := s.CreateDedicatedIPRequest(ctx, orgID, ownerID, "Owner", "Dedicated IP request", "We'd like one", "Received", "10k-100k", "transactional", "acme.example")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if d.Status != "requested" || d.TicketID == "" {
		t.Fatalf("new request: %+v", d)
	}
	if _, err := s.CreateDedicatedIPRequest(ctx, orgID, ownerID, "Owner", "Dedicated IP request", "Again", "Received", "lt10k", "both", ""); !errors.Is(err, ErrDedicatedIPRequestOpen) {
		t.Fatalf("a second open request should fail, got %v", err)
	}
	ticket, err := s.GetSupportTicket(ctx, d.TicketID)
	if err != nil || ticket.Category != "dedicated_ip" {
		t.Fatalf("ticket: %+v %v", ticket, err)
	}

	if ok, err := s.AdvanceDedicatedIPRequest(ctx, d.ID, []string{"requested"}, "approved", nil, nil, "Approved", "answered"); err != nil || !ok {
		t.Fatalf("approve: %v %v", ok, err)
	}
	if ok, _ := s.AdvanceDedicatedIPRequest(ctx, d.ID, []string{"requested"}, "declined", nil, nil, "Declined", "answered"); ok {
		t.Fatal("an approved request must not be declined afterwards")
	}
	sub := "sub_test_" + randomSuffix(t)
	if ok, err := s.AdvanceDedicatedIPRequest(ctx, d.ID, []string{"approved"}, "paid", &sub, nil, "Paid", "open"); err != nil || !ok {
		t.Fatalf("paid: %v %v", ok, err)
	}
	if got, err := s.GetDedicatedIPRequestBySubscription(ctx, sub); err != nil || got.ID != d.ID {
		t.Fatalf("by subscription: %+v %v", got, err)
	}
	ip := "89.106.70.120"
	if ok, err := s.AdvanceDedicatedIPRequest(ctx, d.ID, []string{"paid"}, "active", nil, &ip, "Assigned", "answered"); err != nil || !ok {
		t.Fatalf("active: %v %v", ok, err)
	}
	if _, err := s.GetOpenDedicatedIPRequest(ctx, orgID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an active request isn't open any more, got %v", err)
	}

	msgs, err := s.ListSupportMessages(ctx, d.TicketID, false)
	if err != nil {
		t.Fatalf("messages: %v", err)
	}
	var kinds []string
	for _, m := range msgs {
		kinds = append(kinds, m.AuthorKind)
	}
	want := []string{"customer", "system", "system", "system", "system"}
	if len(kinds) != len(want) {
		t.Fatalf("messages %v, want %v", kinds, want)
	}
	for i := range want {
		if kinds[i] != want[i] {
			t.Fatalf("messages %v, want %v", kinds, want)
		}
	}
}
