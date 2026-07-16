package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"amelu/backend/internal/authz"
	"amelu/backend/internal/db"
	"amelu/backend/internal/sieve"
)

// sieveScriptName is the single script Amelu manages on any mailbox
// account. Confirmed live: Stalwart only allows one active Sieve script
// per account, so a mailbox that's both a domain's Catchall Recipients
// target AND covered by a Bcc Capture rule needs both features merged
// into this one script - two independently activated scripts on the same
// account silently deactivate each other. It's rebuilt wholesale from this
// domain's current rules on every change; the script itself is never
// stored, only the rules that produce it.
const sieveScriptName = "amelu-rules"

// currentCatchallLocalPart returns the local part of this domain's
// Catchall Recipients target, or "" if none is set.
func (a *App) currentCatchallLocalPart(ctx context.Context, domain *db.Domain) (string, error) {
	stalwartDomain, err := a.Stalwart.GetDomain(ctx, domain.Name)
	if err != nil {
		return "", fmt.Errorf("could not load domain from mail cluster: %w", err)
	}
	if stalwartDomain.CatchAllAddress == nil || *stalwartDomain.CatchAllAddress == "" {
		return "", nil
	}
	return strings.TrimSuffix(*stalwartDomain.CatchAllAddress, "@"+domain.Name), nil
}

// redeployMailboxScript rebuilds and installs the merged Amelu script for
// one mailbox, in precedence order: Internal Access (this mailbox's own
// hard block, evaluated first), Recipient Denylist and Sender Junklist
// (domain-wide hard blocks / forced-junk), Sender Denylist, Bcc Capture,
// Subject Handling (all domain-wide - apply to every mailbox), Forwarding
// and Delegation (this mailbox's own routing rules), and finally, only if
// isCatchallTarget is true, Pattern Rewrite (only meaningful on the
// domain's catch-all target - Stalwart rejects RCPT TO for any address
// that isn't already a real mailbox, alias, or the catch-all, so a
// rewrite never gets a chance to run anywhere else). Removes the script
// entirely if every portion ends up empty.
func (a *App) redeployMailboxScript(ctx context.Context, domain *db.Domain, localPart string, isCatchallTarget bool) error {
	var parts []string

	mailbox, err := a.findMailboxByLocalPart(ctx, domain.ID, localPart)
	if err != nil {
		return fmt.Errorf("load mailbox %s@%s: %w", localPart, domain.Name, err)
	}

	if mailbox.InternalAccessOnly {
		internalAccessScript, err := generateInternalAccessScript(domain.Name)
		if err != nil {
			return err
		}
		parts = append(parts, internalAccessScript)
	}

	recipientDenylistScript, err := generateRecipientDenylistScript(domain.SpamRecipientDenylist)
	if err != nil {
		return err
	}
	if recipientDenylistScript != "" {
		parts = append(parts, recipientDenylistScript)
	}

	senderJunklistScript, err := generateSenderJunklistScript(domain.SpamSenderJunklist)
	if err != nil {
		return err
	}
	if senderJunklistScript != "" {
		parts = append(parts, senderJunklistScript)
	}

	senderDenylistScript, err := generateSenderDenylistScript(domain.SpamSenderDenylist)
	if err != nil {
		return err
	}
	if senderDenylistScript != "" {
		parts = append(parts, senderDenylistScript)
	}

	captures, err := a.Store.ListBccCaptures(ctx, domain.ID)
	if err != nil {
		return err
	}
	if len(captures) > 0 {
		bccScript, err := generateBccCaptureScript(captures)
		if err != nil {
			return err
		}
		parts = append(parts, bccScript)
	}

	subjectScript, err := generateSubjectHandlingScript(domain.SpamSubjectRewrite, domain.SpamJunkIfSubjectSpam)
	if err != nil {
		return err
	}
	if subjectScript != "" {
		parts = append(parts, subjectScript)
	}

	forwards, err := a.Store.ListMailboxForwards(ctx, mailbox.ID)
	if err != nil {
		return err
	}
	if len(forwards) > 0 {
		forwardScript, err := generateForwardingScript(forwards)
		if err != nil {
			return err
		}
		parts = append(parts, forwardScript)
	}

	delegateLocalParts := parseListField(mailbox.Delegation)
	if len(delegateLocalParts) > 0 {
		delegateAddresses := make([]string, len(delegateLocalParts))
		for i, lp := range delegateLocalParts {
			delegateAddresses[i] = lp + "@" + domain.Name
		}
		delegationScript, err := generateDelegationScript(delegateAddresses)
		if err != nil {
			return err
		}
		parts = append(parts, delegationScript)
	}

	if isCatchallTarget {
		rewrites, err := a.Store.ListPatternRewrites(ctx, domain.ID)
		if err != nil {
			return err
		}
		if len(rewrites) > 0 {
			rewriteScript, err := generatePatternRewriteScript(rewrites)
			if err != nil {
				return err
			}
			parts = append(parts, rewriteScript)
		}
	}

	merged := sieve.MergeScripts(parts...)
	if merged == "" {
		return a.Stalwart.RemoveSieveScript(ctx, localPart, domain.Name, sieveScriptName)
	}
	if _, err := sieve.Validate(merged); err != nil {
		return fmt.Errorf("generated sieve script failed validation: %w", err)
	}
	return a.Stalwart.DeploySieveScript(ctx, localPart, domain.Name, sieveScriptName, []byte(merged))
}

func generateInternalAccessScript(ownDomain string) (string, error) {
	script, err := sieve.GenerateInternalAccessScript(ownDomain)
	if err != nil {
		return "", err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated internal access script failed validation: %w", err)
	}
	return script, nil
}

func generateForwardingScript(forwards []db.MailboxForward) (string, error) {
	rules := make([]sieve.Forward, len(forwards))
	for i, f := range forwards {
		rules[i] = sieve.Forward{Destination: f.Destination}
	}
	script, err := sieve.GenerateForwardingScript(rules)
	if err != nil {
		return "", err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated forwarding script failed validation: %w", err)
	}
	return script, nil
}

func generateDelegationScript(delegateAddresses []string) (string, error) {
	script, err := sieve.GenerateDelegationScript(delegateAddresses)
	if err != nil {
		return "", err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated delegation script failed validation: %w", err)
	}
	return script, nil
}

// parseListField splits one of the newline-separated list columns
// (spam_sender_denylist etc.) into trimmed, non-empty entries.
func parseListField(field string) []string {
	lines := strings.Split(field, "\n")
	out := make([]string, 0, len(lines))
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

func generateSenderDenylistScript(field string) (string, error) {
	script, err := sieve.GenerateSenderDenylistScript(parseListField(field))
	if err != nil || script == "" {
		return script, err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated sender denylist script failed validation: %w", err)
	}
	return script, nil
}

func generateSenderJunklistScript(field string) (string, error) {
	script, err := sieve.GenerateSenderJunklistScript(parseListField(field))
	if err != nil || script == "" {
		return script, err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated sender junklist script failed validation: %w", err)
	}
	return script, nil
}

func generateRecipientDenylistScript(field string) (string, error) {
	script, err := sieve.GenerateRecipientDenylistScript(parseListField(field))
	if err != nil || script == "" {
		return script, err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated recipient denylist script failed validation: %w", err)
	}
	return script, nil
}

func generateSubjectHandlingScript(rewrite, junkIfSpam bool) (string, error) {
	script, err := sieve.GenerateSubjectHandlingScript(rewrite, junkIfSpam)
	if err != nil || script == "" {
		return script, err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated subject handling script failed validation: %w", err)
	}
	return script, nil
}

func generatePatternRewriteScript(rewrites []db.PatternRewrite) (string, error) {
	rules := make([]sieve.PatternRewrite, len(rewrites))
	for i, rw := range rewrites {
		rules[i] = sieve.PatternRewrite{Pattern: rw.Pattern, Destination: rw.Destination}
	}
	script, err := sieve.GeneratePatternRewriteScript(rules)
	if err != nil {
		return "", err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated pattern rewrite script failed validation: %w", err)
	}
	return script, nil
}

func generateBccCaptureScript(captures []db.BccCapture) (string, error) {
	rules := make([]sieve.BccCapture, len(captures))
	for i, c := range captures {
		rules[i] = sieve.BccCapture{Pattern: c.Pattern, Capture: c.Capture}
	}
	script, err := sieve.GenerateBccCaptureScript(rules)
	if err != nil {
		return "", err
	}
	if _, err := sieve.Validate(script); err != nil {
		return "", fmt.Errorf("generated bcc capture script failed validation: %w", err)
	}
	return script, nil
}

// redeployPatternRewrites rebuilds the merged script on the domain's
// current catch-all mailbox after a Pattern Rewrite rule changes.
// catchallLocalPart == "" means no catch-all is set - the caller must have
// already verified there are no pattern rewrites left in that case (see
// CreatePatternRewrite's precondition check).
func (a *App) redeployPatternRewrites(ctx context.Context, domain *db.Domain, catchallLocalPart string) error {
	if catchallLocalPart == "" {
		return nil
	}
	return a.redeployMailboxScript(ctx, domain, catchallLocalPart, true)
}

// syncPatternRewritesAfterCatchallChange moves the pattern-rewrite portion
// of the merged script from the old catch-all mailbox to the new one when
// Catchall Recipients changes - the old mailbox's script keeps only its
// Bcc Capture portion (if any), the new one gains the rewrite portion.
func (a *App) syncPatternRewritesAfterCatchallChange(ctx context.Context, domain *db.Domain, oldLocalPart, newLocalPart string) error {
	if oldLocalPart != "" && oldLocalPart != newLocalPart {
		if err := a.redeployMailboxScript(ctx, domain, oldLocalPart, false); err != nil {
			return err
		}
	}
	if newLocalPart == "" {
		return nil
	}
	return a.redeployMailboxScript(ctx, domain, newLocalPart, true)
}

// redeployToAllMailboxes rebuilds and installs the merged script on every
// mailbox in the domain, correctly marking whichever one is currently the
// catch-all target. Used whenever any domain-wide rule set changes: Bcc
// Captures, Sender/Recipient Denylist, Sender Junklist, or Subject
// Handling - all of these can match mail delivered to any mailbox, not
// just catch-all traffic.
func (a *App) redeployToAllMailboxes(ctx context.Context, domain *db.Domain) error {
	mailboxes, err := a.Store.ListMailboxes(ctx, domain.ID)
	if err != nil {
		return err
	}
	catchallLocalPart, err := a.currentCatchallLocalPart(ctx, domain)
	if err != nil {
		return err
	}

	for _, m := range mailboxes {
		if err := a.redeployMailboxScript(ctx, domain, m.LocalPart, m.LocalPart == catchallLocalPart); err != nil {
			return fmt.Errorf("update sieve script on %s@%s: %w", m.LocalPart, domain.Name, err)
		}
	}
	return nil
}

// deployDomainWideRulesToMailbox covers a single newly created mailbox
// with this domain's current domain-wide rules (Bcc Captures, Sender/
// Recipient Denylist, Sender Junklist, Subject Handling) immediately,
// rather than only on the next rule change. A brand new mailbox is never
// yet the catch-all target, but check anyway rather than assuming.
func (a *App) deployDomainWideRulesToMailbox(ctx context.Context, domain *db.Domain, localPart string) error {
	catchallLocalPart, err := a.currentCatchallLocalPart(ctx, domain)
	if err != nil {
		return err
	}
	return a.redeployMailboxScript(ctx, domain, localPart, localPart == catchallLocalPart)
}

// --- Pattern Rewrites HTTP handlers ---

type patternRewriteResponse struct {
	ID          string `json:"id"`
	Pattern     string `json:"pattern"`
	Destination string `json:"destination"`
}

func toPatternRewriteResponse(r db.PatternRewrite) patternRewriteResponse {
	return patternRewriteResponse{ID: r.ID, Pattern: r.Pattern, Destination: r.Destination}
}

func (a *App) ListPatternRewrites(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	rewrites, err := a.Store.ListPatternRewrites(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list pattern rewrites")
		return
	}
	out := make([]patternRewriteResponse, len(rewrites))
	for i, rw := range rewrites {
		out[i] = toPatternRewriteResponse(rw)
	}
	writeJSON(w, http.StatusOK, out)
}

type createPatternRewriteRequest struct {
	Pattern     string `json:"pattern"`
	Destination string `json:"destination"`
}

// CreatePatternRewrite requires this domain to already have a Catchall
// Recipient set (see CatchallPage) - a rewrite can only take effect on
// mail that would otherwise land there, since Stalwart never hands an
// unrecognized address to any script in the first place.
func (a *App) CreatePatternRewrite(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req createPatternRewriteRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pattern := strings.TrimSpace(req.Pattern)
	destLocalPart := strings.ToLower(strings.TrimSpace(req.Destination))
	destLocalPart = strings.TrimSuffix(destLocalPart, "@"+domain.Name)
	if pattern == "" || destLocalPart == "" {
		writeError(w, http.StatusBadRequest, "pattern and destination are both required")
		return
	}
	if _, err := a.findMailboxByLocalPart(r.Context(), domain.ID, destLocalPart); err != nil {
		writeError(w, http.StatusBadRequest, "destination must be an existing mailbox on this domain")
		return
	}

	catchallLocalPart, err := a.currentCatchallLocalPart(r.Context(), domain)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if catchallLocalPart == "" {
		writeError(w, http.StatusConflict, "set a catch-all recipient for this domain before adding pattern rewrites")
		return
	}

	destination := destLocalPart + "@" + domain.Name
	created, err := a.Store.CreatePatternRewrite(r.Context(), domain.ID, pattern, destination)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save pattern rewrite")
		return
	}

	if err := a.redeployPatternRewrites(r.Context(), domain, catchallLocalPart); err != nil {
		a.Store.DeletePatternRewrite(r.Context(), domain.ID, created.ID)
		writeError(w, http.StatusBadGateway, "could not deploy pattern rewrite to mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "pattern_rewrite.created", fmt.Sprintf("Added pattern rewrite %s -> %s", pattern, destination))
	writeJSON(w, http.StatusCreated, toPatternRewriteResponse(*created))
}

func (a *App) DeletePatternRewrite(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	ruleID := r.PathValue("ruleId")

	if err := a.Store.DeletePatternRewrite(r.Context(), domain.ID, ruleID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "rule not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not delete pattern rewrite")
		return
	}

	catchallLocalPart, err := a.currentCatchallLocalPart(r.Context(), domain)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if err := a.redeployPatternRewrites(r.Context(), domain, catchallLocalPart); err != nil {
		writeError(w, http.StatusBadGateway, "rule deleted but could not update mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "pattern_rewrite.deleted", "Removed a pattern rewrite")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Bcc Captures HTTP handlers ---

type bccCaptureResponse struct {
	ID      string `json:"id"`
	Pattern string `json:"pattern"`
	Capture string `json:"capture"`
}

func toBccCaptureResponse(c db.BccCapture) bccCaptureResponse {
	return bccCaptureResponse{ID: c.ID, Pattern: c.Pattern, Capture: c.Capture}
}

func (a *App) ListBccCaptures(w http.ResponseWriter, r *http.Request) {
	customer, ok := requireCustomer(w, r)
	if !ok {
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	captures, err := a.Store.ListBccCaptures(r.Context(), domain.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list bcc captures")
		return
	}
	out := make([]bccCaptureResponse, len(captures))
	for i, c := range captures {
		out[i] = toBccCaptureResponse(c)
	}
	writeJSON(w, http.StatusOK, out)
}

type createBccCaptureRequest struct {
	Pattern string `json:"pattern"`
	Capture string `json:"capture"`
}

func (a *App) CreateBccCapture(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}

	var req createBccCaptureRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pattern := strings.TrimSpace(req.Pattern)
	capture := strings.ToLower(strings.TrimSpace(req.Capture))
	if pattern == "" || !strings.Contains(capture, "@") {
		writeError(w, http.StatusBadRequest, "pattern and a valid capture address are both required")
		return
	}

	created, err := a.Store.CreateBccCapture(r.Context(), domain.ID, pattern, capture)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save bcc capture")
		return
	}

	if err := a.redeployToAllMailboxes(r.Context(), domain); err != nil {
		a.Store.DeleteBccCapture(r.Context(), domain.ID, created.ID)
		writeError(w, http.StatusBadGateway, "could not deploy bcc capture to mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "bcc_capture.created", fmt.Sprintf("Added bcc capture %s -> %s", pattern, capture))
	writeJSON(w, http.StatusCreated, toBccCaptureResponse(*created))
}

func (a *App) DeleteBccCapture(w http.ResponseWriter, r *http.Request) {
	customer, role, ok := a.requireOrgActor(w, r)
	if !ok {
		return
	}
	if !authz.CanManageDomains(role) {
		writeError(w, http.StatusForbidden, "you don't have permission to manage domains")
		return
	}
	domain, ok := a.loadOwnedDomain(w, r, customer.OrganizationID.String, r.PathValue("id"))
	if !ok {
		return
	}
	ruleID := r.PathValue("ruleId")

	if err := a.Store.DeleteBccCapture(r.Context(), domain.ID, ruleID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "rule not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not delete bcc capture")
		return
	}

	if err := a.redeployToAllMailboxes(r.Context(), domain); err != nil {
		writeError(w, http.StatusBadGateway, "rule deleted but could not update mail cluster: "+err.Error())
		return
	}
	a.Store.LogActivity(r.Context(), domain.ID, "bcc_capture.deleted", "Removed a bcc capture")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
