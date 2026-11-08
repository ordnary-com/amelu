package db

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// DNSZone is the zone Amelu hosts for a domain on Amelu nameservers.
// Status is "pending" until the domain's nameservers point at Amelu, then
// "active".
type DNSZone struct {
	DomainID    string
	ZoneID      string
	Nameservers []string
	Status      string
	CreatedAt   time.Time
	ActivatedAt sql.NullTime
}

func (s *Store) CreateDNSZone(ctx context.Context, domainID, zoneID string, nameservers []string) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO domain_dns_zones (domain_id, zone_id, nameservers) VALUES ($1, $2, $3)
	`, domainID, zoneID, strings.Join(nameservers, ","))
	return err
}

// GetDNSZone returns ErrNotFound for a domain that keeps its own DNS.
func (s *Store) GetDNSZone(ctx context.Context, domainID string) (*DNSZone, error) {
	var z DNSZone
	var ns string
	err := s.conn.QueryRowContext(ctx, `
		SELECT domain_id, zone_id, nameservers, status, created_at, activated_at
		FROM domain_dns_zones WHERE domain_id = $1
	`, domainID).Scan(&z.DomainID, &z.ZoneID, &ns, &z.Status, &z.CreatedAt, &z.ActivatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if ns != "" {
		z.Nameservers = strings.Split(ns, ",")
	}
	return &z, nil
}

func (s *Store) MarkDNSZoneActive(ctx context.Context, domainID string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE domain_dns_zones SET status = 'active', activated_at = COALESCE(activated_at, now()) WHERE domain_id = $1
	`, domainID)
	return err
}

func (s *Store) DeleteDNSZone(ctx context.Context, domainID string) error {
	_, err := s.conn.ExecContext(ctx, `DELETE FROM domain_dns_zones WHERE domain_id = $1`, domainID)
	return err
}
