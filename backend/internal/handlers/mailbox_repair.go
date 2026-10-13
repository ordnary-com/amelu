package handlers

import (
	"context"
	"fmt"
	"net/http"

	"amelu/backend/internal/db"
)

// Repair recreates what Amelu's database knows but the mail cluster lost
// (the cluster's storage was lost on 2026-08-23; everything from before
// that exists only here). A missing domain is created again (new DKIM key,
// so DNS needs updating), a missing account gets a fresh password that is
// shown once, like on creation. Mail from before is gone either way.

type repairResult struct {
	Address          string `json:"address"`
	DomainRecreated  bool   `json:"domainRecreated"`
	MailboxRecreated bool   `json:"mailboxRecreated"`
	Password         string `json:"password,omitempty"`
	Error            string `json:"error,omitempty"`
}

func (a *App) repairMailbox(ctx context.Context, domain *db.Domain, mailbox *db.Mailbox) (repairResult, error) {
	result := repairResult{Address: mailbox.LocalPart + "@" + domain.Name}
	domainExists, err := a.Stalwart.DomainExists(ctx, domain.Name)
	if err != nil {
		return result, fmt.Errorf("check domain: %w", err)
	}
	if !domainExists {
		if _, err := a.Stalwart.CreateDomain(ctx, domain.Name); err != nil {
			return result, fmt.Errorf("recreate domain: %w", err)
		}
		result.DomainRecreated = true
		// New DKIM key: the DNS page will show it and flip the domain back to active once published.
		a.Store.UpdateDomainStatus(ctx, domain.ID, "dns_pending", "")
		a.Store.LogActivity(ctx, domain.ID, "domain.repaired", "Domain "+domain.Name+" recreated in the mail cluster")
	}
	exists, err := a.Stalwart.MailboxExists(ctx, mailbox.LocalPart, domain.Name)
	if err != nil {
		return result, fmt.Errorf("check mailbox: %w", err)
	}
	if exists {
		return result, nil
	}
	password, err := generatePassword()
	if err != nil {
		return result, err
	}
	if _, err := a.Stalwart.CreateMailbox(ctx, mailbox.LocalPart, domain.Name, password); err != nil {
		return result, fmt.Errorf("recreate mailbox: %w", err)
	}
	result.MailboxRecreated = true
	result.Password = password
	// Best effort, as on creation: the next change redeploys these anyway.
	if err := a.applyDomainDefaultsToMailbox(ctx, domain, mailbox); err != nil {
		a.Store.LogActivity(ctx, domain.ID, "mailbox.defaults_apply_failed", "Could not apply domain defaults to "+result.Address+": "+err.Error())
	}
	if err := a.deployDomainWideRulesToMailbox(ctx, domain, mailbox.LocalPart); err != nil {
		a.Store.LogActivity(ctx, domain.ID, "spam_rules.deploy_failed", "Could not apply spam/capture rules to "+result.Address+": "+err.Error())
	}
	a.Store.LogActivity(ctx, domain.ID, "mailbox.repaired", "Mailbox "+result.Address+" recreated in the mail cluster")
	return result, nil
}

// RepairMailbox -> POST /api/mailboxes/{id}/repair
func (a *App) RepairMailbox(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	mailbox, domain, ok := a.loadOwnedMailbox(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	if mailbox.Status == "deleted" {
		writeError(w, http.StatusConflict, "this mailbox has been deleted")
		return
	}
	result, err := a.repairMailbox(r.Context(), domain, mailbox)
	if err != nil {
		writeUpstreamError(w, "could not repair the mailbox", err)
		return
	}
	if result.MailboxRecreated || result.DomainRecreated {
		a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
			"mailbox.repaired", "mailbox", mailbox.ID, result.Address, nil, requestIP(r))
	}
	writeJSON(w, http.StatusOK, result)
}

// RepairDomainMailboxes -> POST /api/domains/{id}/mailboxes/repair
//
// Every mailbox of the domain that the cluster lost is recreated; the
// response lists them with their new passwords, shown once.
func (a *App) RepairDomainMailboxes(w http.ResponseWriter, r *http.Request) {
	customer, ok := a.requireMailboxManage(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	mailboxes, err := a.Store.ListMailboxes(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list mailboxes")
		return
	}
	results := []repairResult{}
	for i := range mailboxes {
		if mailboxes[i].Status == "deleted" {
			continue
		}
		result, err := a.repairMailbox(r.Context(), domain, &mailboxes[i])
		if err != nil {
			result.Error = upstreamReason(err)
		}
		if result.MailboxRecreated || result.DomainRecreated || result.Error != "" {
			results = append(results, result)
		}
	}
	if len(results) > 0 {
		a.Store.LogOrganizationAudit(r.Context(), customer.OrganizationID.String, &customer.ID, customer.Email,
			"domain.mailboxes_repaired", "domain", domain.ID, domain.Name, map[string]any{"count": len(results)}, requestIP(r))
	}
	writeJSON(w, http.StatusOK, map[string]any{"checked": len(mailboxes), "repaired": results})
}
