package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// ErrInvitationExists means there's already an open (pending, unexpired)
// invitation for this email in this organization - see CreateInvitation.
var ErrInvitationExists = errors.New("an open invitation already exists for this email")

type OrganizationInvitation struct {
	ID                  string
	OrganizationID      string
	Email               string
	Role                string
	TokenHash           string
	InvitedByCustomerID string
	ExpiresAt           time.Time
	AcceptedAt          sql.NullTime
	RevokedAt           sql.NullTime
	CreatedAt           time.Time
}

const invitationColumns = `id, organization_id, email, role, token_hash, invited_by_customer_id, expires_at, accepted_at, revoked_at, created_at`

func scanInvitation(row interface {
	Scan(dest ...any) error
}) (*OrganizationInvitation, error) {
	inv := &OrganizationInvitation{}
	err := row.Scan(&inv.ID, &inv.OrganizationID, &inv.Email, &inv.Role, &inv.TokenHash, &inv.InvitedByCustomerID,
		&inv.ExpiresAt, &inv.AcceptedAt, &inv.RevokedAt, &inv.CreatedAt)
	return inv, err
}

// CreateInvitation records a new invitation, storing only the token hash
// (see organization_invitations migration - mirrors password_reset_tokens).
// If a still-open invitation for the same email (case-insensitive) already
// exists in this organization, returns ErrInvitationExists unless that
// existing invitation has simply expired, in which case it's superseded
// (revoked) so the unique index doesn't block the fresh one.
func (s *Store) CreateInvitation(ctx context.Context, organizationID, email, role, tokenHash, invitedByCustomerID string, expiresAt time.Time) (*OrganizationInvitation, error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var existingID string
	var existingExpiresAt time.Time
	err = tx.QueryRowContext(ctx, `
		SELECT id, expires_at FROM organization_invitations
		WHERE organization_id = $1 AND lower(email) = lower($2) AND accepted_at IS NULL AND revoked_at IS NULL
	`, organizationID, email).Scan(&existingID, &existingExpiresAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if err == nil {
		if existingExpiresAt.After(time.Now()) {
			return nil, ErrInvitationExists
		}
		if _, err := tx.ExecContext(ctx, `UPDATE organization_invitations SET revoked_at = now() WHERE id = $1`, existingID); err != nil {
			return nil, err
		}
	}

	row := tx.QueryRowContext(ctx, `
		INSERT INTO organization_invitations (organization_id, email, role, token_hash, invited_by_customer_id, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING `+invitationColumns,
		organizationID, email, role, tokenHash, invitedByCustomerID, expiresAt)
	inv, err := scanInvitation(row)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return inv, nil
}

// ListOpenInvitations returns invitations that haven't been accepted or
// revoked yet (including expired ones - the frontend shows those as
// "expired" rather than hiding them, so an admin can tell why a re-invite
// was needed).
func (s *Store) ListOpenInvitations(ctx context.Context, organizationID string) ([]OrganizationInvitation, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT `+invitationColumns+`
		FROM organization_invitations
		WHERE organization_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
		ORDER BY created_at DESC
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []OrganizationInvitation
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *inv)
	}
	return out, rows.Err()
}

// GetInvitationByTokenHash is the public accept-flow lookup - callers must
// still check ExpiresAt/AcceptedAt/RevokedAt themselves (see
// handlers.GetInvitation), reporting the same generic "invalid or expired"
// result for every non-usable case so a caller can't distinguish them.
func (s *Store) GetInvitationByTokenHash(ctx context.Context, tokenHash string) (*OrganizationInvitation, error) {
	row := s.conn.QueryRowContext(ctx, `
		SELECT `+invitationColumns+` FROM organization_invitations WHERE token_hash = $1
	`, tokenHash)
	inv, err := scanInvitation(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return inv, nil
}

// RevokeInvitation cancels a still-open invitation. Scoped to organizationID
// so a caller can't revoke another organization's invitation by ID guessing.
func (s *Store) RevokeInvitation(ctx context.Context, organizationID, invitationID string) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE organization_invitations SET revoked_at = now()
		WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
	`, invitationID, organizationID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// MarkInvitationAccepted is the one-time-use gate: the WHERE clause only
// matches an invitation that is still open and unexpired, so two concurrent
// accept requests for the same token race on this UPDATE and exactly one
// of them affects a row - the other gets ErrNotFound and must report the
// invitation as already used.
func (s *Store) MarkInvitationAccepted(ctx context.Context, invitationID string) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE organization_invitations SET accepted_at = now()
		WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
	`, invitationID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// AcceptInvitationForNewCustomer atomically marks the invitation used and
// creates the new customer + organization_members row in one transaction,
// so a concurrent duplicate accept (same token, two in-flight requests)
// can't both succeed: the accepted_at UPDATE below only matches an open,
// unexpired invitation, and Postgres serializes concurrent UPDATEs to the
// same row, so only one caller ever gets past it - the other gets
// ErrNotFound.
func (s *Store) AcceptInvitationForNewCustomer(ctx context.Context, invitationID, organizationID, role, email, name, passwordHash, firstName, lastName, username string) (*Customer, error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		UPDATE organization_invitations SET accepted_at = now()
		WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
	`, invitationID)
	if err != nil {
		return nil, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return nil, err
	} else if n == 0 {
		return nil, ErrNotFound
	}

	c := &Customer{}
	err = tx.QueryRowContext(ctx, `
		INSERT INTO customers (email, name, password_hash, organization_id, first_name, last_name, username)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''))
		RETURNING id, email, name, password_hash, plan_tier_id, organization_id, last_sign_in_at, created_at, first_name, last_name, username
	`, email, name, passwordHash, organizationID, firstName, lastName, username).Scan(
		&c.ID, &c.Email, &c.Name, &c.PasswordHash, &c.PlanTierID, &c.OrganizationID, &c.LastSignInAt, &c.CreatedAt,
		&c.FirstName, &c.LastName, &c.Username,
	)
	if err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO organization_members (organization_id, customer_id, role) VALUES ($1, $2, $3)
	`, organizationID, c.ID, role); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return c, nil
}
