package db

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"strings"
)

type OAuthClient struct {
	ID           string
	Name         string
	RedirectURIs []string
}

// Target kinds a connector can be granted.
const (
	TargetOrg     = "org"
	TargetDomain  = "domain"
	TargetMailbox = "mailbox"
)

// Target is one thing a connector may reach. ID is the organization, domain or
// mailbox id depending on Kind.
type Target struct {
	Kind string
	ID   string
}

func encodeTargets(targets []Target) string {
	parts := make([]string, len(targets))
	for i, t := range targets {
		parts[i] = t.Kind + ":" + t.ID
	}
	return strings.Join(parts, " ")
}

func decodeTargets(raw string) []Target {
	var out []Target
	for _, part := range strings.Fields(raw) {
		kind, id, ok := strings.Cut(part, ":")
		if ok {
			out = append(out, Target{Kind: kind, ID: id})
		}
	}
	return out
}

type OAuthCode struct {
	ClientID      string
	CustomerID    string
	Targets       []Target
	Scopes        []string
	RedirectURI   string
	CodeChallenge string
}

// ConnectorGrant is what a valid access token resolves to: who granted it,
// for which mailbox, with which scopes.
type ConnectorGrant struct {
	TokenID    string
	CustomerID string
	Targets    []Target
	Scopes     []string
}

type Connector struct {
	ID         string
	ClientName string
	Targets    []Target
	Scopes     []string
	CreatedAt  time.Time
	LastUsedAt sql.NullTime
}

func (s *Store) CreateOAuthClient(ctx context.Context, id, name string, redirectURIs []string) error {
	_, err := s.conn.ExecContext(ctx,
		`INSERT INTO oauth_clients (id, name, redirect_uris) VALUES ($1, $2, $3)`,
		id, name, strings.Join(redirectURIs, " "))
	return err
}

func (s *Store) GetOAuthClient(ctx context.Context, id string) (*OAuthClient, error) {
	c := &OAuthClient{}
	var uris string
	err := s.conn.QueryRowContext(ctx,
		`SELECT id, name, redirect_uris FROM oauth_clients WHERE id = $1`, id).
		Scan(&c.ID, &c.Name, &uris)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	c.RedirectURIs = strings.Fields(uris)
	return c, err
}

func (s *Store) CreateOAuthCode(ctx context.Context, codeHash string, c OAuthCode, ttl time.Duration) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO oauth_codes (code_hash, client_id, customer_id, targets, scopes, redirect_uri, code_challenge, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now() + $8 * interval '1 second')`,
		codeHash, c.ClientID, c.CustomerID, encodeTargets(c.Targets), strings.Join(c.Scopes, " "), c.RedirectURI, c.CodeChallenge, int(ttl.Seconds()))
	return err
}

// ConsumeOAuthCode deletes and returns the code in one statement, so a code
// can be redeemed exactly once even under concurrent requests.
func (s *Store) ConsumeOAuthCode(ctx context.Context, codeHash string) (*OAuthCode, error) {
	c := &OAuthCode{}
	var scopes, targets string
	err := s.conn.QueryRowContext(ctx, `
		DELETE FROM oauth_codes WHERE code_hash = $1 AND expires_at > now()
		RETURNING client_id, customer_id, targets, scopes, redirect_uri, code_challenge`,
		codeHash).Scan(&c.ClientID, &c.CustomerID, &targets, &scopes, &c.RedirectURI, &c.CodeChallenge)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	c.Scopes = strings.Fields(scopes)
	c.Targets = decodeTargets(targets)
	return c, err
}

func (s *Store) CreateConnectorToken(ctx context.Context, g OAuthCode, accessHash string, accessTTL time.Duration, refreshHash string) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO connector_tokens (customer_id, targets, client_id, scopes, access_hash, access_expires_at, refresh_hash)
		VALUES ($1, $2, $3, $4, $5, now() + $6 * interval '1 second', $7)`,
		g.CustomerID, encodeTargets(g.Targets), g.ClientID, strings.Join(g.Scopes, " "), accessHash, int(accessTTL.Seconds()), refreshHash)
	return err
}

// RotateConnectorToken swaps in a fresh access and refresh token for the one
// identified by the old refresh hash. A refresh token works once; replaying a
// stolen one after the real client rotated it finds no row.
func (s *Store) RotateConnectorToken(ctx context.Context, oldRefreshHash, clientID, accessHash string, accessTTL time.Duration, refreshHash string) (*OAuthCode, error) {
	g := &OAuthCode{}
	var scopes, targets string
	err := s.conn.QueryRowContext(ctx, `
		UPDATE connector_tokens
		SET access_hash = $3, access_expires_at = now() + $4 * interval '1 second', refresh_hash = $5
		WHERE refresh_hash = $1 AND client_id = $2 AND revoked_at IS NULL
		RETURNING client_id, customer_id, targets, scopes`,
		oldRefreshHash, clientID, accessHash, int(accessTTL.Seconds()), refreshHash).
		Scan(&g.ClientID, &g.CustomerID, &targets, &scopes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	g.Scopes = strings.Fields(scopes)
	g.Targets = decodeTargets(targets)
	return g, err
}

func (s *Store) GetConnectorGrantByAccessHash(ctx context.Context, accessHash string) (*ConnectorGrant, error) {
	g := &ConnectorGrant{}
	var scopes, targets string
	err := s.conn.QueryRowContext(ctx, `
		SELECT t.id, t.customer_id, t.targets, t.scopes
		FROM connector_tokens t
		JOIN customers c ON c.id = t.customer_id
		WHERE t.access_hash = $1 AND t.access_expires_at > now() AND t.revoked_at IS NULL AND c.suspended_at IS NULL`,
		accessHash).Scan(&g.TokenID, &g.CustomerID, &targets, &scopes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	g.Scopes = strings.Fields(scopes)
	g.Targets = decodeTargets(targets)
	s.conn.ExecContext(ctx, `UPDATE connector_tokens SET last_used_at = now() WHERE id = $1`, g.TokenID)
	return g, nil
}

func (s *Store) ListConnectors(ctx context.Context, customerID string) ([]Connector, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT t.id, o.name, t.targets, t.scopes, t.created_at, t.last_used_at
		FROM connector_tokens t
		JOIN oauth_clients o ON o.id = t.client_id
		WHERE t.customer_id = $1 AND t.revoked_at IS NULL
		ORDER BY t.created_at DESC`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Connector
	for rows.Next() {
		var c Connector
		var scopes, targets string
		if err := rows.Scan(&c.ID, &c.ClientName, &targets, &scopes, &c.CreatedAt, &c.LastUsedAt); err != nil {
			return nil, err
		}
		c.Scopes = strings.Fields(scopes)
		c.Targets = decodeTargets(targets)
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) RevokeConnector(ctx context.Context, customerID, id string) error {
	res, err := s.conn.ExecContext(ctx,
		`UPDATE connector_tokens SET revoked_at = now() WHERE id = $1 AND customer_id = $2 AND revoked_at IS NULL`,
		id, customerID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
