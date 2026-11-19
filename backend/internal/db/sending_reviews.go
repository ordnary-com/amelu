package db

import (
	"context"
	"database/sql"
	"errors"
)

// SendingReview is the open sending_review ticket of a domain (migration 0053).
type SendingReview struct {
	TicketID string
	Number   int64
	Status   string
}

const openSendingReviewQuery = `
	SELECT id, number, status FROM support_tickets
	WHERE domain_id = $1 AND category = 'sending_review' AND status <> 'closed'
	ORDER BY created_at DESC LIMIT 1`

// OpenSendingReview returns the domain's sending review ticket that isn't
// closed, or ErrNotFound.
func (s *Store) OpenSendingReview(ctx context.Context, domainID string) (*SendingReview, error) {
	var r SendingReview
	err := s.conn.QueryRowContext(ctx, openSendingReviewQuery, domainID).Scan(&r.TicketID, &r.Number, &r.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// CreateSendingReview opens a sending_review ticket for the domain with the
// customer's message and a system message, unless one is open already; then
// it returns that one and created is false.
func (s *Store) CreateSendingReview(ctx context.Context, organizationID, domainID, customerID, authorName, subject, body, systemBody string) (review *SendingReview, created bool, err error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	// Two clicks at once must not open two tickets. No unique index does this:
	// a reply reopens a closed ticket, which may sit next to a newer open one.
	if _, err := tx.ExecContext(ctx, `SELECT 1 FROM domains WHERE id = $1 FOR UPDATE`, domainID); err != nil {
		return nil, false, err
	}
	var r SendingReview
	err = tx.QueryRowContext(ctx, openSendingReviewQuery, domainID).Scan(&r.TicketID, &r.Number, &r.Status)
	if err == nil {
		return &r, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO support_tickets (organization_id, opened_by, subject, category, domain_id)
		VALUES ($1, $2, $3, 'sending_review', $4) RETURNING id, number, status`,
		organizationID, customerID, subject, domainID).Scan(&r.TicketID, &r.Number, &r.Status); err != nil {
		return nil, false, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO support_messages (ticket_id, author_kind, author_customer_id, author_name, body)
		VALUES ($1, 'customer', $2, $3, $4)`, r.TicketID, customerID, authorName, body); err != nil {
		return nil, false, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO support_messages (ticket_id, author_kind, author_name, body, created_at)
		VALUES ($1, 'system', 'Amelu', $2, now() + interval '1 millisecond')`, r.TicketID, systemBody); err != nil {
		return nil, false, err
	}
	return &r, true, tx.Commit()
}

// OpenSendingReviewTicketIDs returns the ids of the domain's sending review
// tickets that aren't closed. Normally at most one, but a reply can reopen an
// older one next to it.
func (s *Store) OpenSendingReviewTicketIDs(ctx context.Context, domainID string) ([]string, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT id FROM support_tickets
		WHERE domain_id = $1 AND category = 'sending_review' AND status <> 'closed'`, domainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
