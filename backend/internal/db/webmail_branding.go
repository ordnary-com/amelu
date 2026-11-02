package db

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// WebmailBranding is an organization's white-label webmail: its own
// addresses and the look Roundcube takes on there (docs/WEBMAIL.md).
type WebmailBranding struct {
	OrganizationID       string
	Enabled              bool
	Subdomain            string
	CustomHostname       string
	CustomHostnameID     string
	CustomRouteID        string
	CustomHostnameStatus string
	CustomHostnameError  string
	ProductName          string
	AccentColor          string
	SupportURL           string
	LogoType             string
	LogoUpdatedAt        sql.NullTime
	UpdatedAt            time.Time
}

const webmailBrandingColumns = `organization_id, enabled, COALESCE(subdomain, ''), COALESCE(custom_hostname, ''),
	custom_hostname_id, custom_route_id, custom_hostname_status, custom_hostname_error,
	product_name, accent_color, support_url, logo_type, logo_updated_at, updated_at`

func scanWebmailBranding(row interface{ Scan(...any) error }) (*WebmailBranding, error) {
	var b WebmailBranding
	err := row.Scan(&b.OrganizationID, &b.Enabled, &b.Subdomain, &b.CustomHostname,
		&b.CustomHostnameID, &b.CustomRouteID, &b.CustomHostnameStatus, &b.CustomHostnameError,
		&b.ProductName, &b.AccentColor, &b.SupportURL, &b.LogoType, &b.LogoUpdatedAt, &b.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// GetWebmailBranding returns ErrNotFound when the organization never saved any.
func (s *Store) GetWebmailBranding(ctx context.Context, organizationID string) (*WebmailBranding, error) {
	return scanWebmailBranding(s.conn.QueryRowContext(ctx,
		`SELECT `+webmailBrandingColumns+` FROM organization_webmail WHERE organization_id = $1`, organizationID))
}

// GetWebmailBrandingByHost finds the organization a webmail hostname belongs
// to: its <subdomain>.<suffix> address, or its own hostname once Cloudflare
// has it active.
func (s *Store) GetWebmailBrandingByHost(ctx context.Context, host, subdomain string) (*WebmailBranding, error) {
	return scanWebmailBranding(s.conn.QueryRowContext(ctx, `
		SELECT `+webmailBrandingColumns+` FROM organization_webmail
		WHERE (custom_hostname = $1 AND custom_hostname_status = 'active') OR ($2 <> '' AND subdomain = $2)
		LIMIT 1
	`, host, subdomain))
}

// ErrWebmailSubdomainTaken is returned when another organization already has
// that subdomain or hostname.
var ErrWebmailSubdomainTaken = errors.New("webmail address taken")

// SaveWebmailBranding writes the settings an operator edits on the page;
// hostname and logo have their own calls.
func (s *Store) SaveWebmailBranding(ctx context.Context, b *WebmailBranding) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO organization_webmail (organization_id, enabled, subdomain, product_name, accent_color, support_url, updated_at)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, now())
		ON CONFLICT (organization_id) DO UPDATE SET
			enabled = EXCLUDED.enabled, subdomain = EXCLUDED.subdomain, product_name = EXCLUDED.product_name,
			accent_color = EXCLUDED.accent_color, support_url = EXCLUDED.support_url, updated_at = now()
	`, b.OrganizationID, b.Enabled, b.Subdomain, b.ProductName, b.AccentColor, b.SupportURL)
	if isUniqueViolation(err) {
		return ErrWebmailSubdomainTaken
	}
	return err
}

// SetWebmailCustomHostname records (or, with an empty hostname, clears) the
// organization's own hostname and its Cloudflare ids.
func (s *Store) SetWebmailCustomHostname(ctx context.Context, organizationID, hostname, hostnameID, routeID, status, errText string) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO organization_webmail (organization_id, custom_hostname, custom_hostname_id, custom_route_id, custom_hostname_status, custom_hostname_error, updated_at)
		VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, now())
		ON CONFLICT (organization_id) DO UPDATE SET
			custom_hostname = EXCLUDED.custom_hostname, custom_hostname_id = EXCLUDED.custom_hostname_id,
			custom_route_id = EXCLUDED.custom_route_id, custom_hostname_status = EXCLUDED.custom_hostname_status,
			custom_hostname_error = EXCLUDED.custom_hostname_error, updated_at = now()
	`, organizationID, hostname, hostnameID, routeID, status, errText)
	if isUniqueViolation(err) {
		return ErrWebmailSubdomainTaken
	}
	return err
}

// SetWebmailCustomHostnameStatus updates what Cloudflare reports.
func (s *Store) SetWebmailCustomHostnameStatus(ctx context.Context, organizationID, status, errText string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE organization_webmail SET custom_hostname_status = $2, custom_hostname_error = $3, updated_at = now()
		WHERE organization_id = $1
	`, organizationID, status, errText)
	return err
}

// SetWebmailLogo stores the logo (nil clears it).
func (s *Store) SetWebmailLogo(ctx context.Context, organizationID string, logo []byte, contentType string) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO organization_webmail (organization_id, logo, logo_type, logo_updated_at, updated_at)
		VALUES ($1, $2, $3, CASE WHEN $2::bytea IS NULL THEN NULL ELSE now() END, now())
		ON CONFLICT (organization_id) DO UPDATE SET
			logo = EXCLUDED.logo, logo_type = EXCLUDED.logo_type, logo_updated_at = EXCLUDED.logo_updated_at, updated_at = now()
	`, organizationID, logo, contentType)
	return err
}

// GetWebmailLogo returns the logo bytes and type, ErrNotFound without one.
func (s *Store) GetWebmailLogo(ctx context.Context, organizationID string) ([]byte, string, error) {
	var logo []byte
	var contentType string
	err := s.conn.QueryRowContext(ctx,
		`SELECT logo, logo_type FROM organization_webmail WHERE organization_id = $1 AND logo IS NOT NULL`, organizationID).Scan(&logo, &contentType)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	return logo, contentType, err
}

// PlanAllowsWebmailBranding reports whether the organization's plan includes it.
func (s *Store) PlanAllowsWebmailBranding(ctx context.Context, organizationID string) (bool, error) {
	tier, err := s.GetOrganizationPlanTierID(ctx, organizationID)
	if err != nil {
		return false, err
	}
	var allowed bool
	err = s.conn.QueryRowContext(ctx, `SELECT webmail_branding FROM plan_tiers WHERE id = $1`, tier).Scan(&allowed)
	return allowed, err
}

// OrganizationOwnsVerifiedDomain reports whether hostname is one of the
// organization's verified domains or a subdomain of one.
func (s *Store) OrganizationOwnsVerifiedDomain(ctx context.Context, organizationID, hostname string) (bool, error) {
	var ok bool
	err := s.conn.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM domains
			WHERE customer_id IN (SELECT id FROM customers WHERE organization_id = $1)
			  AND verified_at IS NOT NULL
			  AND ($2 = lower(name) OR $2 LIKE '%.' || lower(name))
		)
	`, organizationID, hostname).Scan(&ok)
	return ok, err
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
