package db

import "context"

// LogAdminAction records an admin action against an entity that has no
// domain to attach to (activity_log is domain-scoped only - see
// LogActivity). Used for customer/organization/subscription/changelog
// admin actions from the Helm cross-customer admin surface.
func (s *Store) LogAdminAction(ctx context.Context, entityType, entityID, operator, action, message string) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO admin_audit_log (entity_type, entity_id, operator, action, message)
		VALUES ($1, $2, $3, $4, $5)
	`, entityType, entityID, operator, action, message)
	return err
}
