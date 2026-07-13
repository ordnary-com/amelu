package handlers

import (
	"context"
	"errors"
	"log"

	"amelu/backend/internal/stalwart"
)

// RunExpirationSweep suspends or fully deletes every mailbox whose
// expires_at has passed, per its own remove_upon_expiration choice. Meant
// to be called periodically by a background ticker (see cmd/api/main.go) -
// Stalwart has no native mailbox-expiration mechanism, so this is Amelu's
// own scheduled job standing in for it.
func (a *App) RunExpirationSweep(ctx context.Context) {
	mailboxes, err := a.Store.ListExpiredMailboxes(ctx)
	if err != nil {
		log.Printf("expiration sweep: list expired mailboxes: %v", err)
		return
	}

	for _, mailbox := range mailboxes {
		domain, err := a.Store.GetDomainByID(ctx, mailbox.DomainID)
		if err != nil {
			log.Printf("expiration sweep: load domain for mailbox %s: %v", mailbox.ID, err)
			continue
		}
		address := mailbox.LocalPart + "@" + domain.Name

		if mailbox.RemoveUponExpiration {
			if err := a.Stalwart.DeleteMailbox(ctx, mailbox.LocalPart, domain.Name); err != nil && !errors.Is(err, stalwart.ErrNotFound) {
				log.Printf("expiration sweep: delete %s in mail cluster: %v", address, err)
				continue
			}
			if err := a.Store.DeleteMailbox(ctx, mailbox.ID); err != nil {
				log.Printf("expiration sweep: delete %s record: %v", address, err)
				continue
			}
			a.Store.LogActivity(ctx, domain.ID, "mailbox.expired_deleted", "Mailbox "+address+" permanently deleted on expiration")
			log.Printf("expiration sweep: deleted %s (expired, remove-on-expiry)", address)
			continue
		}

		if err := a.Stalwart.SuspendMailbox(ctx, mailbox.LocalPart, domain.Name); err != nil {
			log.Printf("expiration sweep: suspend %s in mail cluster: %v", address, err)
			continue
		}
		if err := a.Store.UpdateMailboxStatus(ctx, mailbox.ID, "suspended"); err != nil {
			log.Printf("expiration sweep: update status for %s: %v", address, err)
			continue
		}
		a.Store.LogActivity(ctx, domain.ID, "mailbox.expired_suspended", "Mailbox "+address+" suspended on expiration")
		log.Printf("expiration sweep: suspended %s (expired)", address)
	}
}
