package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// WebmailUser is the signed-in mailbox as seen by the webmail handlers:
// the mailbox row plus its domain name and Stalwart account id.
type WebmailUser struct {
	MailboxID   string
	LocalPart   string
	DomainName  string
	DisplayName string
	Status      string
	AccountID   string
}

func (u *WebmailUser) Email() string { return u.LocalPart + "@" + u.DomainName }

// FindMailboxByAddress looks a mailbox up by its address, for sign-in. The
// domain must belong to Amelu; a mailbox that only exists in the cluster is
// ErrNotFound here.
func (s *Store) FindMailboxByAddress(ctx context.Context, localPart, domainName string) (*WebmailUser, error) {
	u := &WebmailUser{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT m.id, m.local_part, d.name, m.display_name, m.status
		FROM mailboxes m
		JOIN domains d ON d.id = m.domain_id
		WHERE lower(m.local_part) = lower($1) AND lower(d.name) = lower($2)
	`, localPart, domainName).Scan(&u.MailboxID, &u.LocalPart, &u.DomainName, &u.DisplayName, &u.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) CreateWebmailSession(ctx context.Context, tokenHash, mailboxID, accountID string, expiresAt time.Time) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO webmail_sessions (token_hash, mailbox_id, stalwart_account_id, expires_at)
		VALUES ($1, $2, $3, $4)
	`, tokenHash, mailboxID, accountID, expiresAt)
	return err
}

// GetWebmailSession resolves a session token to its mailbox. A mailbox that
// has been suspended or deleted since sign-in no longer resolves.
func (s *Store) GetWebmailSession(ctx context.Context, tokenHash string) (*WebmailUser, error) {
	u := &WebmailUser{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT m.id, m.local_part, d.name, m.display_name, m.status, w.stalwart_account_id
		FROM webmail_sessions w
		JOIN mailboxes m ON m.id = w.mailbox_id
		JOIN domains d ON d.id = m.domain_id
		WHERE w.token_hash = $1 AND w.expires_at > now() AND m.status = 'active'
	`, tokenHash).Scan(&u.MailboxID, &u.LocalPart, &u.DomainName, &u.DisplayName, &u.Status, &u.AccountID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	// Best effort; a stale last_seen_at is harmless.
	s.conn.ExecContext(ctx, `UPDATE webmail_sessions SET last_seen_at = now() WHERE token_hash = $1`, tokenHash)
	return u, nil
}

func (s *Store) DeleteWebmailSession(ctx context.Context, tokenHash string) error {
	_, err := s.conn.ExecContext(ctx, `DELETE FROM webmail_sessions WHERE token_hash = $1`, tokenHash)
	return err
}
