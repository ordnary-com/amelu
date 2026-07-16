package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Valid organization roles, in the same order the spec lists them - see
// internal/authz for what each one can actually do.
const (
	RoleOwner    = "owner"
	RoleAdmin    = "admin"
	RoleHelpdesk = "helpdesk"
	RoleBilling  = "billing"
	RoleReadOnly = "read_only"
)

var ErrLastOwner = errors.New("organization must keep at least one owner")

type OrganizationMember struct {
	ID             string
	OrganizationID string
	CustomerID     string
	Email          string
	Name           string
	Role           string
	CreatedAt      time.Time
}

// GetMemberRole is the core tenant-isolation + authz lookup: every mutating
// team/domain/mailbox/billing handler resolves the acting customer's role
// this way before doing anything else. Returns ErrNotFound if the customer
// isn't a member of this organization (including "wrong organization"),
// which callers surface as 404/403 rather than leaking which orgs exist.
func (s *Store) GetMemberRole(ctx context.Context, organizationID, customerID string) (string, error) {
	var role string
	err := s.conn.QueryRowContext(ctx, `
		SELECT role FROM organization_members WHERE organization_id = $1 AND customer_id = $2
	`, organizationID, customerID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return role, nil
}

// ListOrganizationMembers returns every member of the organization, newest
// first, joined onto the customer for display fields.
func (s *Store) ListOrganizationMembers(ctx context.Context, organizationID string) ([]OrganizationMember, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT m.id, m.organization_id, m.customer_id, c.email, c.name, m.role, m.created_at
		FROM organization_members m
		JOIN customers c ON c.id = m.customer_id
		WHERE m.organization_id = $1
		ORDER BY m.created_at ASC
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []OrganizationMember
	for rows.Next() {
		var m OrganizationMember
		if err := rows.Scan(&m.ID, &m.OrganizationID, &m.CustomerID, &m.Email, &m.Name, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// CountOwners is used to guard the "never remove the last owner" invariant.
func (s *Store) CountOwners(ctx context.Context, organizationID string) (int, error) {
	var n int
	err := s.conn.QueryRowContext(ctx, `
		SELECT count(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner'
	`, organizationID).Scan(&n)
	return n, err
}

// AddOrganizationMember records a brand new member (signup, or invitation
// acceptance for a customer just created for that purpose).
func (s *Store) AddOrganizationMember(ctx context.Context, organizationID, customerID, role string) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO organization_members (organization_id, customer_id, role)
		VALUES ($1, $2, $3)
	`, organizationID, customerID, role)
	return err
}

// UpdateMemberRole changes a member's role, refusing any change that would
// leave the organization without an owner (demoting the last owner). Runs
// in its own transaction with a row lock on the organization's owner count,
// so two concurrent demotions of two different owners can't both succeed
// and leave zero.
func (s *Store) UpdateMemberRole(ctx context.Context, organizationID, customerID, newRole string) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var currentRole string
	err = tx.QueryRowContext(ctx, `
		SELECT role FROM organization_members
		WHERE organization_id = $1 AND customer_id = $2
		FOR UPDATE
	`, organizationID, customerID).Scan(&currentRole)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	if currentRole == RoleOwner && newRole != RoleOwner {
		var ownerCount int
		if err := tx.QueryRowContext(ctx, `
			SELECT count(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner'
		`, organizationID).Scan(&ownerCount); err != nil {
			return err
		}
		if ownerCount <= 1 {
			return ErrLastOwner
		}
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND customer_id = $3
	`, newRole, organizationID, customerID); err != nil {
		return err
	}

	return tx.Commit()
}

// RemoveMember deletes a member's customer account entirely - Amelu has no
// "member without an account" state, so removing someone from the team
// means revoking their Amelu login outright. Refuses to remove the last
// owner. Any domain the removed member personally created (domains.customer_id)
// is reassigned to the organization's remaining owner first, so the team
// doesn't lose access to domains/mailboxes a departing teammate happened to
// have created.
func (s *Store) RemoveMember(ctx context.Context, organizationID, customerID string) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var role string
	err = tx.QueryRowContext(ctx, `
		SELECT role FROM organization_members
		WHERE organization_id = $1 AND customer_id = $2
		FOR UPDATE
	`, organizationID, customerID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	var newOwnerID string
	if role == RoleOwner {
		var ownerCount int
		if err := tx.QueryRowContext(ctx, `
			SELECT count(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner'
		`, organizationID).Scan(&ownerCount); err != nil {
			return err
		}
		if ownerCount <= 1 {
			return ErrLastOwner
		}
	}
	// Reassign this member's domains to any other owner, so a departing
	// admin/helpdesk/billing/read_only member (or a non-last owner) doesn't
	// take their domains down with them.
	err = tx.QueryRowContext(ctx, `
		SELECT customer_id FROM organization_members
		WHERE organization_id = $1 AND role = 'owner' AND customer_id != $2
		LIMIT 1
	`, organizationID, customerID).Scan(&newOwnerID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if newOwnerID != "" {
		if _, err := tx.ExecContext(ctx, `UPDATE domains SET customer_id = $1 WHERE customer_id = $2`, newOwnerID, customerID); err != nil {
			return err
		}
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM customers WHERE id = $1`, customerID); err != nil {
		return err
	}

	return tx.Commit()
}
