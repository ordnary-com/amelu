package handlers

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"amelu/backend/internal/stalwart"
)

// Outgoing mail per plan: a daily cap per sender domain (plan_tiers.
// max_outgoing_per_day), enforced by Stalwart outbound throttles that this
// file keeps in sync. Paid plans get a rule listing their domains; the free
// rule covers every other sender. Over the cap Stalwart holds mail in the
// queue until the window allows it, nothing bounces. The existing rules
// (200 an hour per sender domain, the noez cap in total) stay as they are.

const sendingLimitPrefix = "Amelu plan: "

// Never throttled by plan: our own mail.
var sendingLimitExempt = []string{"amelu.org", "ordnary.com"}

var (
	sendingLimitsMu sync.Mutex
	// What the last successful sync wrote; an unchanged set isn't written
	// again, so Stalwart isn't reloaded every hour for nothing.
	lastSendingLimits string
)

func plainHostname(name string) bool {
	if name == "" {
		return false
	}
	for _, c := range name {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '.' || c == '-') {
			return false
		}
	}
	return true
}

// senderDomainIn is a Stalwart expression true for any of the domains.
func senderDomainIn(domains []string) string {
	parts := make([]string, 0, len(domains))
	for _, d := range domains {
		parts = append(parts, "sender_domain == '"+d+"'")
	}
	return strings.Join(parts, " || ")
}

// sendingLimitRules builds one rule per plan from the domains' plans, the
// alias domains Stalwart knows about, and the per-plan daily limits.
func sendingLimitRules(plans map[string][]string, aliases map[string][]string, limits map[string]int) []stalwart.OutboundThrottle {
	const day = int64(24 * time.Hour / time.Millisecond)
	var rules []stalwart.OutboundThrottle
	excluded := append([]string{}, sendingLimitExempt...)

	tiers := make([]string, 0, len(limits))
	for tier := range limits {
		if tier != "free" {
			tiers = append(tiers, tier)
		}
	}
	sort.Strings(tiers)
	for _, tier := range tiers {
		seen := map[string]bool{}
		var names []string
		for _, d := range plans[tier] {
			for _, n := range append([]string{d}, aliases[d]...) {
				if plainHostname(n) && !seen[n] {
					seen[n] = true
					names = append(names, n)
				}
			}
		}
		sort.Strings(names)
		excluded = append(excluded, names...)
		rules = append(rules, stalwart.OutboundThrottle{
			Description: fmt.Sprintf("%s%s, %d a day per sender domain", sendingLimitPrefix, tier, limits[tier]),
			Enable:      true,
			If:          senderDomainIn(names),
			Count:       limits[tier],
			PeriodMs:    day,
		})
	}
	rules = append(rules, stalwart.OutboundThrottle{
		Description: fmt.Sprintf("%sfree, %d a day per sender domain", sendingLimitPrefix, limits["free"]),
		Enable:      true,
		If:          senderDomainIn(excluded),
		Negate:      true,
		Count:       limits["free"],
		PeriodMs:    day,
	})
	return rules
}

// SyncSendingLimits writes the plan rules to Stalwart. Rules are found by
// their description prefix and tier, so a changed limit replaces the rule.
func (a *App) SyncSendingLimits(ctx context.Context) error {
	sendingLimitsMu.Lock()
	defer sendingLimitsMu.Unlock()

	limits, err := a.Store.ListOutgoingLimits(ctx)
	if err != nil {
		return fmt.Errorf("load plan limits: %w", err)
	}
	if _, ok := limits["free"]; !ok {
		return fmt.Errorf("no free plan tier")
	}
	domainPlans, err := a.Store.ListDomainPlans(ctx)
	if err != nil {
		return fmt.Errorf("load domain plans: %w", err)
	}
	plans := map[string][]string{}
	for _, d := range domainPlans {
		plans[d.PlanTierID] = append(plans[d.PlanTierID], d.Name)
	}
	aliases, err := a.Stalwart.DomainAliases(ctx)
	if err != nil {
		return fmt.Errorf("load domain aliases: %w", err)
	}
	existing, err := a.Stalwart.ListOutboundThrottles(ctx)
	if err != nil {
		return fmt.Errorf("load throttles: %w", err)
	}
	byTier := map[string]string{}
	for desc, id := range existing {
		if rest, ok := strings.CutPrefix(desc, sendingLimitPrefix); ok {
			byTier[strings.SplitN(rest, ",", 2)[0]] = id
		}
	}
	rules := sendingLimitRules(plans, aliases, limits)
	fingerprint := fmt.Sprintf("%+v", rules)
	missing := false
	for _, rule := range rules {
		if byTier[ruleTier(rule)] == "" {
			missing = true
		}
	}
	if fingerprint == lastSendingLimits && !missing {
		return nil
	}
	for _, rule := range rules {
		if err := a.Stalwart.PutOutboundThrottle(ctx, byTier[ruleTier(rule)], rule); err != nil {
			return err
		}
	}
	if err := a.Stalwart.ReloadSettings(ctx); err != nil {
		return fmt.Errorf("reload settings: %w", err)
	}
	lastSendingLimits = fingerprint
	log.Printf("sending limits: synced %d plan rules", len(rules))
	return nil
}

func ruleTier(rule stalwart.OutboundThrottle) string {
	return strings.SplitN(strings.TrimPrefix(rule.Description, sendingLimitPrefix), ",", 2)[0]
}

// RequestSendingLimitsSync runs a sync in the background, for after a plan
// change; the hourly run catches anything this misses.
func (a *App) RequestSendingLimitsSync() {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		if err := a.SyncSendingLimits(ctx); err != nil {
			log.Printf("sending limits: sync failed: %v", err)
		}
	}()
}
