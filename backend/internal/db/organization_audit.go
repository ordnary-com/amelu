package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

type OrganizationAuditEntry struct {
	ID              string
	OrganizationID  string
	ActorCustomerID sql.NullString
	ActorEmail      string
	Action          string
	ObjectType      string
	ObjectID        sql.NullString
	ObjectLabel     sql.NullString
	Metadata        json.RawMessage
	RequestIP       sql.NullString
	CreatedAt       time.Time
}

// LogOrganizationAudit appends one entry to the organization's audit trail.
// Never called inside the same transaction as the action it's logging in a
// way that would roll it back on an unrelated later failure - callers log
// after the mutating step they care about has already committed, same
// convention as Store.LogActivity. metadata must never contain passwords,
// tokens, secrets, or full request bodies - see individual call sites.
func (s *Store) LogOrganizationAudit(ctx context.Context, organizationID string, actorCustomerID *string, actorEmail, action, objectType, objectID, objectLabel string, metadata map[string]any, requestIP string) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	_, err = s.conn.ExecContext(ctx, `
		INSERT INTO organization_audit_log
			(organization_id, actor_customer_id, actor_email, action, object_type, object_id, object_label, metadata, request_ip)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, NULLIF($9, ''))
	`, organizationID, actorCustomerID, actorEmail, action, objectType, objectID, objectLabel, metadataJSON, requestIP)
	return err
}

// ListOrganizationAudit returns audit entries for the organization, newest
// first, optionally restricted to a set of object types (role-based
// visibility - see internal/authz.VisibleAuditObjectTypes) and paginated by
// a created_at cursor (the createdAt of the last entry on the previous
// page - pass zero time for the first page).
func (s *Store) ListOrganizationAudit(ctx context.Context, organizationID string, objectTypes []string, before time.Time, limit int) ([]OrganizationAuditEntry, error) {
	if before.IsZero() {
		before = time.Now().Add(24 * time.Hour)
	}

	var rows *sql.Rows
	var err error
	if objectTypes == nil {
		rows, err = s.conn.QueryContext(ctx, `
			SELECT id, organization_id, actor_customer_id, actor_email, action, object_type, object_id, object_label, metadata, request_ip, created_at
			FROM organization_audit_log
			WHERE organization_id = $1 AND created_at < $2
			ORDER BY created_at DESC
			LIMIT $3
		`, organizationID, before, limit)
	} else {
		rows, err = s.conn.QueryContext(ctx, `
			SELECT id, organization_id, actor_customer_id, actor_email, action, object_type, object_id, object_label, metadata, request_ip, created_at
			FROM organization_audit_log
			WHERE organization_id = $1 AND created_at < $2 AND object_type = ANY($3)
			ORDER BY created_at DESC
			LIMIT $4
		`, organizationID, before, objectTypes, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []OrganizationAuditEntry
	for rows.Next() {
		var e OrganizationAuditEntry
		if err := rows.Scan(&e.ID, &e.OrganizationID, &e.ActorCustomerID, &e.ActorEmail, &e.Action, &e.ObjectType, &e.ObjectID, &e.ObjectLabel, &e.Metadata, &e.RequestIP, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
