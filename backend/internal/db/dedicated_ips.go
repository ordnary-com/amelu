package db

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// DedicatedIP is a sending IP reserved for (at most) one organization.
type DedicatedIP struct {
	IP               string
	Hostname         string
	OrganizationID   sql.NullString
	OrganizationName string
	AssignedAt       sql.NullTime
	Note             string
	CreatedAt        time.Time
}

// DedicatedIPRoute is what marduk needs to send from an assigned IP: its
// address and name, and the domains whose mail goes out from it.
type DedicatedIPRoute struct {
	IP       string   `json:"ip"`
	Hostname string   `json:"hostname"`
	Domains  []string `json:"domains"`
}

var (
	// ErrDedicatedIPInUse is returned when deleting an IP that's still assigned.
	ErrDedicatedIPInUse = errors.New("dedicated IP is assigned")
	// ErrDedicatedIPExists is returned when the address or hostname is already in the inventory.
	ErrDedicatedIPExists = errors.New("dedicated IP already exists")
)

const dedicatedIPSelect = `
	SELECT d.ip, d.hostname, d.organization_id, COALESCE(o.name, ''), d.assigned_at, d.note, d.created_at
	FROM dedicated_ips d LEFT JOIN organizations o ON o.id = d.organization_id`

func scanDedicatedIPs(rows *sql.Rows) ([]DedicatedIP, error) {
	defer rows.Close()
	var out []DedicatedIP
	for rows.Next() {
		var d DedicatedIP
		if err := rows.Scan(&d.IP, &d.Hostname, &d.OrganizationID, &d.OrganizationName, &d.AssignedAt, &d.Note, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListDedicatedIPs returns the whole inventory, in address order.
func (s *Store) ListDedicatedIPs(ctx context.Context) ([]DedicatedIP, error) {
	rows, err := s.conn.QueryContext(ctx, dedicatedIPSelect+` ORDER BY inet(d.ip)`)
	if err != nil {
		return nil, err
	}
	return scanDedicatedIPs(rows)
}

// ListDedicatedIPsForOrganization returns the IPs assigned to an organization.
func (s *Store) ListDedicatedIPsForOrganization(ctx context.Context, organizationID string) ([]DedicatedIP, error) {
	rows, err := s.conn.QueryContext(ctx, dedicatedIPSelect+` WHERE d.organization_id = $1 ORDER BY inet(d.ip)`, organizationID)
	if err != nil {
		return nil, err
	}
	return scanDedicatedIPs(rows)
}

// GetDedicatedIP returns one IP of the inventory.
func (s *Store) GetDedicatedIP(ctx context.Context, ip string) (*DedicatedIP, error) {
	rows, err := s.conn.QueryContext(ctx, dedicatedIPSelect+` WHERE d.ip = $1`, ip)
	if err != nil {
		return nil, err
	}
	list, err := scanDedicatedIPs(rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ErrNotFound
	}
	return &list[0], nil
}

// AddDedicatedIP puts an IP into the inventory, unassigned.
func (s *Store) AddDedicatedIP(ctx context.Context, ip, hostname, note string) error {
	_, err := s.conn.ExecContext(ctx, `INSERT INTO dedicated_ips (ip, hostname, note) VALUES ($1, $2, $3)`, ip, hostname, note)
	if err != nil && strings.Contains(err.Error(), "duplicate key") {
		return ErrDedicatedIPExists
	}
	return err
}

// AssignDedicatedIP gives an IP to an organization, or releases it with nil.
func (s *Store) AssignDedicatedIP(ctx context.Context, ip string, organizationID *string) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE dedicated_ips SET organization_id = $2, assigned_at = CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END
		WHERE ip = $1`, ip, organizationID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateDedicatedIPNote replaces an IP's staff note.
func (s *Store) UpdateDedicatedIPNote(ctx context.Context, ip, note string) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE dedicated_ips SET note = $2 WHERE ip = $1`, ip, note)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteDedicatedIP takes an unassigned IP out of the inventory.
func (s *Store) DeleteDedicatedIP(ctx context.Context, ip string) error {
	d, err := s.GetDedicatedIP(ctx, ip)
	if err != nil {
		return err
	}
	if d.OrganizationID.Valid {
		return ErrDedicatedIPInUse
	}
	_, err = s.conn.ExecContext(ctx, `DELETE FROM dedicated_ips WHERE ip = $1 AND organization_id IS NULL`, ip)
	return err
}

// DedicatedIPRoutes returns every assigned IP with its organization's domain
// names (lower case, sorted), for marduk.
func (s *Store) DedicatedIPRoutes(ctx context.Context) ([]DedicatedIPRoute, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT d.ip, d.hostname, COALESCE(string_agg(lower(dm.name), ',' ORDER BY lower(dm.name)), '')
		FROM dedicated_ips d
		LEFT JOIN customers c ON c.organization_id = d.organization_id
		LEFT JOIN domains dm ON dm.customer_id = c.id
		WHERE d.organization_id IS NOT NULL
		GROUP BY d.ip, d.hostname
		ORDER BY inet(d.ip)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DedicatedIPRoute{}
	for rows.Next() {
		var r DedicatedIPRoute
		var domains string
		if err := rows.Scan(&r.IP, &r.Hostname, &domains); err != nil {
			return nil, err
		}
		r.Domains = []string{}
		if domains != "" {
			r.Domains = strings.Split(domains, ",")
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
