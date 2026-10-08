package handlers

import (
	"context"
	"fmt"
	"log"
	"time"
)

// RunStartupMaintenance runs one-off tasks that bring existing data in line
// with a code change, once across all API instances (db.ClaimMaintenanceRun).
func (a *App) RunStartupMaintenance(ctx context.Context) {
	a.runMaintenanceOnce(ctx, "2026-10-08-redeploy-forwarding-scripts", a.redeployForwardingScripts)
}

func (a *App) runMaintenanceOnce(ctx context.Context, name string, task func(context.Context) error) {
	claimed, err := a.Store.ClaimMaintenanceRun(ctx, name)
	if err != nil {
		log.Printf("maintenance %s: claim: %v", name, err)
		return
	}
	if !claimed {
		return
	}
	if err := task(ctx); err != nil {
		log.Printf("maintenance %s: %v (will retry on next start)", name, err)
		if err := a.Store.ReleaseMaintenanceRun(ctx, name); err != nil {
			log.Printf("maintenance %s: release: %v", name, err)
		}
		return
	}
	log.Printf("maintenance %s: done", name)
}

// redeployForwardingScripts rebuilds the Sieve script of every mailbox on a
// domain with forwards. Scripts are only rebuilt when a rule changes, so a
// fix to how forwarding scripts are generated never reached mailboxes whose
// forwards already existed: they kept forwarding only mail whose spam
// header read "No".
func (a *App) redeployForwardingScripts(ctx context.Context) error {
	domainIDs, err := a.Store.ListDomainIDsWithForwards(ctx)
	if err != nil {
		return fmt.Errorf("list domains with forwards: %w", err)
	}
	var failed int
	for _, id := range domainIDs {
		domain, err := a.Store.GetDomainByID(ctx, id)
		if err == nil {
			err = a.redeployToAllMailboxes(ctx, domain)
		}
		if err != nil {
			failed++
			log.Printf("maintenance: redeploy scripts for domain %s: %v", id, err)
		}
	}
	if failed > 0 {
		return fmt.Errorf("%d of %d domains failed", failed, len(domainIDs))
	}
	log.Printf("maintenance: redeployed scripts on %d domains", len(domainIDs))
	return nil
}

// StartupMaintenanceTimeout bounds RunStartupMaintenance, which makes a few
// Stalwart calls per mailbox.
const StartupMaintenanceTimeout = 10 * time.Minute
