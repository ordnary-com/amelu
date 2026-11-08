package db

import (
	"context"
	"testing"
	"time"
)

func TestSendingHistoryRoundTrip(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	dom := "hist-" + randomSuffix(t) + ".example"
	today := time.Now().UTC().Truncate(24 * time.Hour)
	days := []string{today.AddDate(0, 0, -1).Format(time.DateOnly), today.Format(time.DateOnly)}
	h := SendingHistory{
		Days: days,
		Domains: map[string]DomainHistory{dom: {
			Sent: []int{3, 0}, Delivered: []int{2, 0}, Deferred: []int{0, 0}, Rejected: []int{1, 0},
			Reasons: []SendingReason{{Text: "Mailbox not found", Count: 1}},
		}},
		Senders: map[string][]int{"ann@" + dom: {3, 0}, "bob@other.example": {1, 1}},
	}
	if err := s.ReplaceSendingHistory(ctx, h); err != nil {
		t.Fatal(err)
	}
	// A second report for the same days replaces, not adds.
	if err := s.ReplaceSendingHistory(ctx, h); err != nil {
		t.Fatal(err)
	}
	got, reasons, senders, err := s.DomainSendingHistory(ctx, dom, today.AddDate(0, 0, -13))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Sent != 3 || got[0].Rejected != 1 {
		t.Fatalf("days: %+v", got)
	}
	if len(reasons) != 1 || reasons[0].Text != "Mailbox not found" {
		t.Fatalf("reasons: %+v", reasons)
	}
	if senders["ann@"+dom][days[0]] != 3 || len(senders) != 1 {
		t.Fatalf("senders: %+v", senders)
	}
}
