package handlers

import (
	"context"
	"errors"
	"sort"
	"strings"

	"amelu/backend/internal/db"
)

// catalogDomain is a domain of the organization with its active mailboxes: the
// unit the consent page lists and a grant can cover as a whole.
type catalogDomain struct {
	Domain    db.Domain
	Mailboxes []db.Mailbox
}

func (m catalogDomain) address(box db.Mailbox) string {
	return box.LocalPart + "@" + m.Domain.Name
}

// orgCatalog lists the organization's domains with their active mailboxes. It
// does no role check: callers decide whether the caller may see mail contents.
func (a *App) orgCatalog(ctx context.Context, organizationID string) ([]catalogDomain, error) {
	domains, err := a.Store.ListDomainsForOrganization(ctx, organizationID)
	if err != nil {
		return nil, err
	}
	out := make([]catalogDomain, 0, len(domains))
	for _, d := range domains {
		boxes, err := a.Store.ListMailboxes(ctx, d.ID)
		if err != nil {
			return nil, err
		}
		entry := catalogDomain{Domain: d}
		for _, m := range boxes {
			if m.Status == "active" {
				entry.Mailboxes = append(entry.Mailboxes, m)
			}
		}
		out = append(out, entry)
	}
	return out, nil
}

// requestedTargets is what the customer ticked on the consent page.
type requestedTargets struct {
	All        bool     `json:"all"`
	DomainIDs  []string `json:"domainIds"`
	MailboxIDs []string `json:"mailboxIds"`
}

var errNoTargets = errors.New("choose at least one mailbox or domain")

// validateTargets turns the ticked boxes into grant targets, refusing anything
// outside the catalog. Choosing everything covers all the rest, and a mailbox
// inside a chosen domain is dropped as redundant.
func validateTargets(req requestedTargets, organizationID string, catalog []catalogDomain) ([]db.Target, error) {
	if req.All {
		return []db.Target{{Kind: db.TargetOrg, ID: organizationID}}, nil
	}

	domainByID := map[string]catalogDomain{}
	mailboxDomain := map[string]string{}
	for _, d := range catalog {
		domainByID[d.Domain.ID] = d
		for _, m := range d.Mailboxes {
			mailboxDomain[m.ID] = d.Domain.ID
		}
	}

	var targets []db.Target
	chosenDomains := map[string]bool{}
	for _, id := range req.DomainIDs {
		if _, ok := domainByID[id]; !ok {
			return nil, errors.New("choose domains from your organization")
		}
		if !chosenDomains[id] {
			chosenDomains[id] = true
			targets = append(targets, db.Target{Kind: db.TargetDomain, ID: id})
		}
	}
	seen := map[string]bool{}
	for _, id := range req.MailboxIDs {
		domainID, ok := mailboxDomain[id]
		if !ok {
			return nil, errors.New("choose mailboxes from your organization")
		}
		if chosenDomains[domainID] || seen[id] {
			continue
		}
		seen[id] = true
		targets = append(targets, db.Target{Kind: db.TargetMailbox, ID: id})
	}
	if len(targets) == 0 {
		return nil, errNoTargets
	}
	return targets, nil
}

// targetLabels describes a grant for the audit log and the connected apps list.
// Targets that no longer exist (a deleted mailbox) are left out.
func targetLabels(targets []db.Target, organizationID string, catalog []catalogDomain) []string {
	domainName := map[string]string{}
	mailboxAddr := map[string]string{}
	for _, d := range catalog {
		domainName[d.Domain.ID] = d.Domain.Name
		for _, m := range d.Mailboxes {
			mailboxAddr[m.ID] = d.address(m)
		}
	}
	var out []string
	for _, t := range targets {
		switch t.Kind {
		case db.TargetOrg:
			if t.ID == organizationID {
				out = append(out, "All mailboxes")
			}
		case db.TargetDomain:
			if name, ok := domainName[t.ID]; ok {
				out = append(out, "All of "+name)
			}
		case db.TargetMailbox:
			if addr, ok := mailboxAddr[t.ID]; ok {
				out = append(out, addr)
			}
		}
	}
	return out
}

// grantedMailbox is a mailbox a grant resolves to right now.
type grantedMailbox struct {
	Mailbox db.Mailbox
	Domain  db.Domain
}

func (g grantedMailbox) Address() string { return g.Mailbox.LocalPart + "@" + g.Domain.Name }

// grantedMailboxes resolves a grant's targets against the live catalog, so a
// domain grant picks up mailboxes created later and loses deleted ones.
func grantedMailboxes(targets []db.Target, organizationID string, catalog []catalogDomain) []grantedMailbox {
	wantDomain := map[string]bool{}
	wantMailbox := map[string]bool{}
	everything := false
	for _, t := range targets {
		switch t.Kind {
		case db.TargetOrg:
			everything = everything || t.ID == organizationID
		case db.TargetDomain:
			wantDomain[t.ID] = true
		case db.TargetMailbox:
			wantMailbox[t.ID] = true
		}
	}
	var out []grantedMailbox
	for _, d := range catalog {
		for _, m := range d.Mailboxes {
			if everything || wantDomain[d.Domain.ID] || wantMailbox[m.ID] {
				out = append(out, grantedMailbox{Mailbox: m, Domain: d.Domain})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Address() < out[j].Address() })
	return out
}

// pickMailbox chooses the mailbox a tool call is for. With one granted mailbox
// the argument is optional; with several it must name one of them.
func pickMailbox(granted []grantedMailbox, address string) (*grantedMailbox, error) {
	address = strings.ToLower(strings.TrimSpace(address))
	if address == "" {
		switch len(granted) {
		case 0:
			return nil, toolErr("this connection has no mailbox available right now")
		case 1:
			return &granted[0], nil
		}
		return nil, toolErr("this connection covers several mailboxes, so pass mailbox as one of: %s", joinAddresses(granted))
	}
	for i := range granted {
		if strings.ToLower(granted[i].Address()) == address {
			return &granted[i], nil
		}
	}
	return nil, toolErr("this connection does not have access to %s. Available: %s", address, joinAddresses(granted))
}

func joinAddresses(granted []grantedMailbox) string {
	if len(granted) == 0 {
		return "none"
	}
	parts := make([]string, len(granted))
	for i, g := range granted {
		parts[i] = g.Address()
	}
	return strings.Join(parts, ", ")
}
