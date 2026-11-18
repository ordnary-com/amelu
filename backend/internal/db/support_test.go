package db

import (
	"context"
	"errors"
	"strconv"
	"testing"
)

func TestSupportTicketLifecycle(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)
	otherOrg, _ := newTestOrgWithOwner(t, s)

	ticket, err := s.CreateSupportTicket(ctx, orgID, ownerID, "Owner", "Mail bounces", "delivery", nil, "Gmail rejects us")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if ticket.Number == 0 || ticket.Status != "open" || ticket.MessageCount != 1 || ticket.LastAuthorKind != "customer" {
		t.Fatalf("unexpected new ticket %+v", ticket)
	}
	if _, err := s.GetSupportTicketForOrganization(ctx, otherOrg, ticket.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another organization must not see the ticket, got %v", err)
	}

	if _, err := s.AddSupportMessage(ctx, ticket.ID, "staff", nil, "agent@ordnary.com", "Looking into it", true, ""); err != nil {
		t.Fatalf("internal note: %v", err)
	}
	if _, err := s.AddSupportMessage(ctx, ticket.ID, "staff", nil, "agent@ordnary.com", "Fixed, try again", false, "answered"); err != nil {
		t.Fatalf("staff reply: %v", err)
	}
	got, err := s.GetSupportTicketForOrganization(ctx, orgID, ticket.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != "answered" || got.LastAuthorKind != "staff" || got.MessageCount != 2 {
		t.Fatalf("after staff reply: %+v", got)
	}
	visible, _ := s.ListSupportMessages(ctx, ticket.ID, false)
	all, _ := s.ListSupportMessages(ctx, ticket.ID, true)
	if len(visible) != 2 || len(all) != 3 {
		t.Fatalf("customer sees %d messages, admin %d; want 2 and 3", len(visible), len(all))
	}

	closed, high, agent := "closed", "high", "agent@ordnary.com"
	if err := s.UpdateSupportTicket(ctx, ticket.ID, &closed, &high, &agent); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, _ = s.GetSupportTicket(ctx, ticket.ID)
	if got.Status != "closed" || !got.ClosedAt.Valid || got.Priority != "high" || got.AssignedTo.String != agent {
		t.Fatalf("after close: %+v", got)
	}
	empty := ""
	if err := s.UpdateSupportTicket(ctx, ticket.ID, nil, nil, &empty); err != nil {
		t.Fatalf("clear assignee: %v", err)
	}
	if got, _ = s.GetSupportTicket(ctx, ticket.ID); got.AssignedTo.Valid || got.Status != "closed" {
		t.Fatalf("clearing the assignee must keep the status: %+v", got)
	}

	// A staff reply that closes the ticket records when.
	if _, err := s.AddSupportMessage(ctx, ticket.ID, "staff", nil, "agent@ordnary.com", "Closing", false, "closed"); err != nil {
		t.Fatalf("closing reply: %v", err)
	}
	if got, _ = s.GetSupportTicket(ctx, ticket.ID); got.Status != "closed" || !got.ClosedAt.Valid {
		t.Fatalf("closing reply: %+v", got)
	}

	// A customer reply reopens it.
	if _, err := s.AddSupportMessage(ctx, ticket.ID, "customer", &ownerID, "Owner", "Still broken", false, "open"); err != nil {
		t.Fatalf("customer reply: %v", err)
	}
	if got, _ = s.GetSupportTicket(ctx, ticket.ID); got.Status != "open" || got.ClosedAt.Valid {
		t.Fatalf("reply should reopen: %+v", got)
	}

	list, err := s.ListSupportTickets(ctx, "open", "#"+strconv.FormatInt(ticket.Number, 10), 50)
	if err != nil || len(list) != 1 || list[0].ID != ticket.ID {
		t.Fatalf("admin search by number: %v %+v", err, list)
	}
	if n, _ := s.CountOpenSupportTickets(ctx, orgID); n != 1 {
		t.Fatalf("open tickets = %d, want 1", n)
	}
}

func TestSupportAttachments(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	orgID, ownerID := newTestOrgWithOwner(t, s)

	ticket, err := s.CreateSupportTicket(ctx, orgID, ownerID, "Owner", "Bounce", "delivery", nil, "See attached")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	m, err := s.AddSupportMessage(ctx, ticket.ID, "customer", &ownerID, "Owner", "", false, "open",
		NewSupportAttachment{Filename: "bounce.eml", ContentType: "text/plain; charset=utf-8", Data: []byte("550 5.7.1 rejected")})
	if err != nil {
		t.Fatalf("reply with file: %v", err)
	}
	if len(m.Attachments) != 1 || m.Attachments[0].Size != 18 || m.Attachments[0].ID == "" {
		t.Fatalf("unexpected attachments on the new message: %+v", m.Attachments)
	}
	note, err := s.AddSupportMessage(ctx, ticket.ID, "staff", nil, "agent@ordnary.com", "Log excerpt", true, "",
		NewSupportAttachment{Filename: "log.txt", ContentType: "text/plain; charset=utf-8", Data: []byte("internal")})
	if err != nil {
		t.Fatalf("internal note with file: %v", err)
	}

	visible, err := s.ListSupportMessages(ctx, ticket.ID, false)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	files := 0
	for _, msg := range visible {
		files += len(msg.Attachments)
	}
	if files != 1 {
		t.Fatalf("customers should see 1 attachment, got %d", files)
	}
	att, data, err := s.GetSupportAttachment(ctx, ticket.ID, m.Attachments[0].ID, false)
	if err != nil || att.Filename != "bounce.eml" || string(data) != "550 5.7.1 rejected" {
		t.Fatalf("get attachment: %+v %q %v", att, data, err)
	}
	if _, _, err := s.GetSupportAttachment(ctx, ticket.ID, note.Attachments[0].ID, false); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an internal note's file must stay hidden from customers, got %v", err)
	}
	if _, _, err := s.GetSupportAttachment(ctx, ticket.ID, note.Attachments[0].ID, true); err != nil {
		t.Fatalf("staff should get the internal file: %v", err)
	}
}
