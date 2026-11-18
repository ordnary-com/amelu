package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// DedicatedIPRequest is an organization's request for a dedicated IP, kept
// with the support ticket it was opened as.
type DedicatedIPRequest struct {
	ID                   string
	TicketID             string
	OrganizationID       string
	RequestedBy          sql.NullString
	Volume               string
	UseCase              string
	Domains              string
	Status               string
	StripeSubscriptionID sql.NullString
	IP                   sql.NullString
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// ErrDedicatedIPRequestOpen is returned when the organization already has a
// request that hasn't ended.
var ErrDedicatedIPRequestOpen = errors.New("a dedicated IP request is already open")

const dedicatedIPRequestColumns = `id, ticket_id, organization_id, requested_by, volume, use_case, domains, status,
	stripe_subscription_id, ip, created_at, updated_at`

func scanDedicatedIPRequest(row interface{ Scan(dest ...any) error }) (*DedicatedIPRequest, error) {
	var d DedicatedIPRequest
	err := row.Scan(&d.ID, &d.TicketID, &d.OrganizationID, &d.RequestedBy, &d.Volume, &d.UseCase, &d.Domains, &d.Status,
		&d.StripeSubscriptionID, &d.IP, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// CreateDedicatedIPRequest opens the request's ticket (category dedicated_ip)
// with the customer's message, then a system message, in one transaction.
// ErrDedicatedIPRequestOpen when one is still open.
func (s *Store) CreateDedicatedIPRequest(ctx context.Context, organizationID, customerID, authorName, subject, body, systemBody, volume, useCase, domains string) (*DedicatedIPRequest, error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var open int
	if err := tx.QueryRowContext(ctx, `
		SELECT count(*) FROM dedicated_ip_requests
		WHERE organization_id = $1 AND status IN ('requested', 'approved', 'paid')`, organizationID).Scan(&open); err != nil {
		return nil, err
	}
	if open > 0 {
		return nil, ErrDedicatedIPRequestOpen
	}
	var ticketID string
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO support_tickets (organization_id, opened_by, subject, category)
		VALUES ($1, $2, $3, 'dedicated_ip') RETURNING id`, organizationID, customerID, subject).Scan(&ticketID); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO support_messages (ticket_id, author_kind, author_customer_id, author_name, body)
		VALUES ($1, 'customer', $2, $3, $4)`, ticketID, customerID, authorName, body); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO support_messages (ticket_id, author_kind, author_name, body, created_at)
		VALUES ($1, 'system', 'Amelu', $2, now() + interval '1 millisecond')`, ticketID, systemBody); err != nil {
		return nil, err
	}
	req, err := scanDedicatedIPRequest(tx.QueryRowContext(ctx, `
		INSERT INTO dedicated_ip_requests (ticket_id, organization_id, requested_by, volume, use_case, domains)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING `+dedicatedIPRequestColumns,
		ticketID, organizationID, customerID, volume, useCase, domains))
	if err != nil {
		return nil, err
	}
	return req, tx.Commit()
}

// GetDedicatedIPRequest returns a request by id.
func (s *Store) GetDedicatedIPRequest(ctx context.Context, id string) (*DedicatedIPRequest, error) {
	return scanDedicatedIPRequest(s.conn.QueryRowContext(ctx, `SELECT `+dedicatedIPRequestColumns+` FROM dedicated_ip_requests WHERE id = $1`, id))
}

// GetDedicatedIPRequestByTicket returns the request a ticket was opened for.
func (s *Store) GetDedicatedIPRequestByTicket(ctx context.Context, ticketID string) (*DedicatedIPRequest, error) {
	return scanDedicatedIPRequest(s.conn.QueryRowContext(ctx, `SELECT `+dedicatedIPRequestColumns+` FROM dedicated_ip_requests WHERE ticket_id = $1`, ticketID))
}

// GetOpenDedicatedIPRequest returns the organization's request that hasn't
// ended yet (requested, approved or paid), or ErrNotFound.
func (s *Store) GetOpenDedicatedIPRequest(ctx context.Context, organizationID string) (*DedicatedIPRequest, error) {
	return scanDedicatedIPRequest(s.conn.QueryRowContext(ctx, `
		SELECT `+dedicatedIPRequestColumns+` FROM dedicated_ip_requests
		WHERE organization_id = $1 AND status IN ('requested', 'approved', 'paid')
		ORDER BY created_at DESC LIMIT 1`, organizationID))
}

// GetDedicatedIPRequestBySubscription returns the request a Stripe
// subscription pays for.
func (s *Store) GetDedicatedIPRequestBySubscription(ctx context.Context, subscriptionID string) (*DedicatedIPRequest, error) {
	return scanDedicatedIPRequest(s.conn.QueryRowContext(ctx, `
		SELECT `+dedicatedIPRequestColumns+` FROM dedicated_ip_requests WHERE stripe_subscription_id = $1`, subscriptionID))
}

// AdvanceDedicatedIPRequest moves a request from one of the statuses in from
// to status, setting the subscription or IP when given, and adds a system
// message to its ticket that leaves the ticket at ticketStatus. It reports
// false when the request wasn't in any of from (nothing changes then).
func (s *Store) AdvanceDedicatedIPRequest(ctx context.Context, id string, from []string, status string, subscriptionID, ip *string, systemBody, ticketStatus string) (bool, error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var ticketID string
	err = tx.QueryRowContext(ctx, `
		UPDATE dedicated_ip_requests SET status = $2,
		  stripe_subscription_id = COALESCE($4, stripe_subscription_id),
		  ip = COALESCE($5, ip), updated_at = now()
		WHERE id = $1 AND status = ANY($3) RETURNING ticket_id`, id, status, from, subscriptionID, ip).Scan(&ticketID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO support_messages (ticket_id, author_kind, author_name, body) VALUES ($1, 'system', 'Amelu', $2)`, ticketID, systemBody); err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE support_tickets SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN now() END, updated_at = now() WHERE id = $1`, ticketID, ticketStatus); err != nil {
		return false, err
	}
	return true, tx.Commit()
}
