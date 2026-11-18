package db

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"
)

// SupportTicket is one conversation between an organization and Amelu
// support, with the joined names the dashboard and Airplane show.
type SupportTicket struct {
	ID               string
	Number           int64
	OrganizationID   string
	OrganizationName string
	OpenedBy         sql.NullString
	OpenedByName     string
	OpenedByEmail    string
	Subject          string
	Category         string
	DomainID         sql.NullString
	DomainName       sql.NullString
	Status           string
	Priority         string
	AssignedTo       sql.NullString
	CreatedAt        time.Time
	UpdatedAt        time.Time
	ClosedAt         sql.NullTime
	// Who wrote the last message the customer can see: customer or staff.
	LastAuthorKind string
	MessageCount   int
}

type SupportMessage struct {
	ID               string
	TicketID         string
	AuthorKind       string
	AuthorCustomerID sql.NullString
	AuthorName       string
	Body             string
	Internal         bool
	CreatedAt        time.Time
}

const supportTicketSelect = `
	SELECT t.id, t.number, t.organization_id, o.name, t.opened_by, COALESCE(c.name, ''), COALESCE(c.email, ''),
	       t.subject, t.category, t.domain_id, d.name, t.status, t.priority, t.assigned_to,
	       t.created_at, t.updated_at, t.closed_at,
	       COALESCE((SELECT m.author_kind FROM support_messages m WHERE m.ticket_id = t.id AND NOT m.internal
	                 ORDER BY m.created_at DESC LIMIT 1), 'customer'),
	       (SELECT count(*) FROM support_messages m WHERE m.ticket_id = t.id AND NOT m.internal)
	FROM support_tickets t
	JOIN organizations o ON o.id = t.organization_id
	LEFT JOIN customers c ON c.id = t.opened_by
	LEFT JOIN domains d ON d.id = t.domain_id`

func scanSupportTicket(row interface{ Scan(dest ...any) error }) (*SupportTicket, error) {
	t := &SupportTicket{}
	err := row.Scan(&t.ID, &t.Number, &t.OrganizationID, &t.OrganizationName, &t.OpenedBy, &t.OpenedByName, &t.OpenedByEmail,
		&t.Subject, &t.Category, &t.DomainID, &t.DomainName, &t.Status, &t.Priority, &t.AssignedTo,
		&t.CreatedAt, &t.UpdatedAt, &t.ClosedAt, &t.LastAuthorKind, &t.MessageCount)
	return t, err
}

func collectSupportTickets(rows *sql.Rows) ([]SupportTicket, error) {
	defer rows.Close()
	var out []SupportTicket
	for rows.Next() {
		t, err := scanSupportTicket(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

// CountOpenSupportTickets counts an organization's tickets that aren't closed.
func (s *Store) CountOpenSupportTickets(ctx context.Context, organizationID string) (int, error) {
	var n int
	err := s.conn.QueryRowContext(ctx,
		`SELECT count(*) FROM support_tickets WHERE organization_id = $1 AND status <> 'closed'`, organizationID).Scan(&n)
	return n, err
}

// CreateSupportTicket opens a ticket with its first message from the customer.
func (s *Store) CreateSupportTicket(ctx context.Context, organizationID, customerID, authorName, subject, category string, domainID *string, body string) (*SupportTicket, error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var id string
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO support_tickets (organization_id, opened_by, subject, category, domain_id)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		organizationID, customerID, subject, category, domainID).Scan(&id); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO support_messages (ticket_id, author_kind, author_customer_id, author_name, body)
		VALUES ($1, 'customer', $2, $3, $4)`, id, customerID, authorName, body); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetSupportTicket(ctx, id)
}

// ListSupportTicketsForOrganization returns an organization's tickets, most
// recently active first.
func (s *Store) ListSupportTicketsForOrganization(ctx context.Context, organizationID string) ([]SupportTicket, error) {
	rows, err := s.conn.QueryContext(ctx, supportTicketSelect+` WHERE t.organization_id = $1 ORDER BY t.updated_at DESC`, organizationID)
	if err != nil {
		return nil, err
	}
	return collectSupportTickets(rows)
}

// GetSupportTicketForOrganization returns ErrNotFound for another
// organization's ticket, so ids can't be probed.
func (s *Store) GetSupportTicketForOrganization(ctx context.Context, organizationID, id string) (*SupportTicket, error) {
	t, err := scanSupportTicket(s.conn.QueryRowContext(ctx, supportTicketSelect+` WHERE t.id = $1 AND t.organization_id = $2`, id, organizationID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return t, err
}

// GetSupportTicket is the cross-organization lookup for the admin surface.
func (s *Store) GetSupportTicket(ctx context.Context, id string) (*SupportTicket, error) {
	t, err := scanSupportTicket(s.conn.QueryRowContext(ctx, supportTicketSelect+` WHERE t.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return t, err
}

// ListSupportTickets is the admin inbox. status "" means every status; query
// matches the subject, ticket number, organization name or opener email.
func (s *Store) ListSupportTickets(ctx context.Context, status, query string, limit int) ([]SupportTicket, error) {
	where := []string{"true"}
	args := []any{}
	if status != "" {
		args = append(args, status)
		where = append(where, "t.status = $1")
	}
	if q := strings.TrimSpace(query); q != "" {
		args = append(args, "%"+q+"%", strings.TrimPrefix(q, "#"))
		like, num := "$"+strconv.Itoa(len(args)-1), "$"+strconv.Itoa(len(args))
		where = append(where, `(t.subject ILIKE `+like+` OR o.name ILIKE `+like+` OR c.email ILIKE `+like+` OR t.number::text = `+num+`)`)
	}
	args = append(args, limit)
	rows, err := s.conn.QueryContext(ctx, supportTicketSelect+` WHERE `+strings.Join(where, " AND ")+
		` ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END, t.updated_at DESC LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, err
	}
	return collectSupportTickets(rows)
}

// SupportTicketCounts returns the number of tickets per status.
func (s *Store) SupportTicketCounts(ctx context.Context) (map[string]int, error) {
	rows, err := s.conn.QueryContext(ctx, `SELECT status, count(*) FROM support_tickets GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{"open": 0, "answered": 0, "closed": 0}
	for rows.Next() {
		var st string
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, rows.Err()
}

// ListSupportMessages returns a ticket's messages oldest first; staff notes
// only when includeInternal.
func (s *Store) ListSupportMessages(ctx context.Context, ticketID string, includeInternal bool) ([]SupportMessage, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT id, ticket_id, author_kind, author_customer_id, author_name, body, internal, created_at
		FROM support_messages WHERE ticket_id = $1 AND (NOT internal OR $2) ORDER BY created_at`, ticketID, includeInternal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SupportMessage
	for rows.Next() {
		var m SupportMessage
		if err := rows.Scan(&m.ID, &m.TicketID, &m.AuthorKind, &m.AuthorCustomerID, &m.AuthorName, &m.Body, &m.Internal, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// AddSupportMessage appends a message and, unless it's an internal note,
// moves the ticket to newStatus ("open" after a customer reply, "answered"
// after a staff reply).
func (s *Store) AddSupportMessage(ctx context.Context, ticketID, authorKind string, authorCustomerID *string, authorName, body string, internal bool, newStatus string) (*SupportMessage, error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	m := &SupportMessage{TicketID: ticketID, AuthorKind: authorKind, AuthorName: authorName, Body: body, Internal: internal}
	if authorCustomerID != nil {
		m.AuthorCustomerID = sql.NullString{String: *authorCustomerID, Valid: true}
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO support_messages (ticket_id, author_kind, author_customer_id, author_name, body, internal)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
		ticketID, authorKind, authorCustomerID, authorName, body, internal).Scan(&m.ID, &m.CreatedAt); err != nil {
		return nil, err
	}
	if internal {
		_, err = tx.ExecContext(ctx, `UPDATE support_tickets SET updated_at = now() WHERE id = $1`, ticketID)
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE support_tickets SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN now() END, updated_at = now() WHERE id = $1`, ticketID, newStatus)
	}
	if err != nil {
		return nil, err
	}
	return m, tx.Commit()
}

// UpdateSupportTicket changes status, priority or assignee; nil leaves a field
// alone and an empty assignee clears it.
func (s *Store) UpdateSupportTicket(ctx context.Context, id string, status, priority, assignedTo *string) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE support_tickets SET
		  status      = COALESCE($2, status),
		  closed_at   = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, now()) WHEN $2 IS NULL THEN closed_at ELSE NULL END,
		  priority    = COALESCE($3, priority),
		  assigned_to = CASE WHEN $4::text IS NULL THEN assigned_to ELSE NULLIF($4, '') END,
		  updated_at  = now()
		WHERE id = $1`, id, status, priority, assignedTo)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
