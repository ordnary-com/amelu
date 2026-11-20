package handlers

import (
	"reflect"
	"strings"
	"testing"

	"amelu/backend/internal/db"
)

func testCatalog() []catalogDomain {
	return []catalogDomain{
		{Domain: db.Domain{ID: "d1", Name: "beard.ca"}, Mailboxes: []db.Mailbox{{ID: "m1", LocalPart: "contact"}, {ID: "m2", LocalPart: "orders"}}},
		{Domain: db.Domain{ID: "d2", Name: "shop.ca"}, Mailboxes: []db.Mailbox{{ID: "m3", LocalPart: "hello"}}},
		{Domain: db.Domain{ID: "d3", Name: "empty.ca"}},
	}
}

func TestValidateTargets(t *testing.T) {
	cat := testCatalog()

	got, err := validateTargets(requestedTargets{All: true, DomainIDs: []string{"nope"}}, "org1", cat)
	if err != nil || !reflect.DeepEqual(got, []db.Target{{Kind: db.TargetOrg, ID: "org1"}}) {
		t.Fatalf("all: %v %v", got, err)
	}

	// A mailbox inside a chosen domain is redundant; one elsewhere is kept.
	got, err = validateTargets(requestedTargets{DomainIDs: []string{"d1", "d1"}, MailboxIDs: []string{"m1", "m3", "m3"}}, "org1", cat)
	want := []db.Target{{Kind: db.TargetDomain, ID: "d1"}, {Kind: db.TargetMailbox, ID: "m3"}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("mixed: %v %v", got, err)
	}

	for name, req := range map[string]requestedTargets{
		"empty":           {},
		"foreign domain":  {DomainIDs: []string{"other-org-domain"}},
		"foreign mailbox": {MailboxIDs: []string{"other-org-mailbox"}},
	} {
		if _, err := validateTargets(req, "org1", cat); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestGrantedMailboxesFollowsTheLiveCatalog(t *testing.T) {
	cat := testCatalog()
	addrs := func(targets []db.Target, org string) string {
		var out []string
		for _, g := range grantedMailboxes(targets, org, cat) {
			out = append(out, g.Address())
		}
		return strings.Join(out, ",")
	}

	if got := addrs([]db.Target{{Kind: db.TargetDomain, ID: "d1"}}, "org1"); got != "contact@beard.ca,orders@beard.ca" {
		t.Fatalf("domain: %s", got)
	}
	if got := addrs([]db.Target{{Kind: db.TargetMailbox, ID: "m3"}, {Kind: db.TargetDomain, ID: "d1"}}, "org1"); got != "contact@beard.ca,hello@shop.ca,orders@beard.ca" {
		t.Fatalf("mixed: %s", got)
	}
	if got := addrs([]db.Target{{Kind: db.TargetOrg, ID: "org1"}}, "org1"); got != "contact@beard.ca,hello@shop.ca,orders@beard.ca" {
		t.Fatalf("org: %s", got)
	}
	// An org grant only counts for the organization that made it.
	if got := addrs([]db.Target{{Kind: db.TargetOrg, ID: "org1"}}, "org2"); got != "" {
		t.Fatalf("org grant leaked to another org: %s", got)
	}
	// A deleted mailbox simply drops out.
	if got := addrs([]db.Target{{Kind: db.TargetMailbox, ID: "gone"}}, "org1"); got != "" {
		t.Fatalf("deleted mailbox: %s", got)
	}
}

func TestPickMailbox(t *testing.T) {
	cat := testCatalog()
	all := grantedMailboxes([]db.Target{{Kind: db.TargetOrg, ID: "o"}}, "o", cat)
	one := grantedMailboxes([]db.Target{{Kind: db.TargetMailbox, ID: "m1"}}, "o", cat)

	if g, err := pickMailbox(one, ""); err != nil || g.Address() != "contact@beard.ca" {
		t.Fatalf("single without arg: %v %v", g, err)
	}
	if _, err := pickMailbox(all, ""); err == nil || !strings.Contains(err.Error(), "hello@shop.ca") {
		t.Fatalf("several without arg should list them: %v", err)
	}
	if g, err := pickMailbox(all, " Hello@Shop.ca "); err != nil || g.Address() != "hello@shop.ca" {
		t.Fatalf("case-insensitive pick: %v %v", g, err)
	}
	if _, err := pickMailbox(one, "orders@beard.ca"); err == nil {
		t.Fatal("picked a mailbox outside the grant")
	}
}

func TestTargetLabels(t *testing.T) {
	got := targetLabels([]db.Target{{Kind: db.TargetDomain, ID: "d2"}, {Kind: db.TargetMailbox, ID: "m1"}, {Kind: db.TargetMailbox, ID: "gone"}}, "o", testCatalog())
	if !reflect.DeepEqual(got, []string{"All of shop.ca", "contact@beard.ca"}) {
		t.Fatalf("%v", got)
	}
	if got := targetLabels([]db.Target{{Kind: db.TargetOrg, ID: "o"}}, "o", nil); !reflect.DeepEqual(got, []string{"All mailboxes"}) {
		t.Fatalf("%v", got)
	}
}
