package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type PasswordResetToken struct {
	ID        string
	MailboxID string
	TokenHash string
	CreatedAt time.Time
	ExpiresAt time.Time
	UsedAt    sql.NullTime
}

func (s *Store) CreatePasswordResetToken(ctx context.Context, mailboxID, tokenHash string, expiresAt time.Time) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO password_reset_tokens (mailbox_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`, mailboxID, tokenHash, expiresAt)
	return err
}

// GetValidPasswordResetToken looks up a token by its hash, returning
// ErrNotFound if it doesn't exist, is already used, or has expired -
// callers should surface the same generic "invalid or expired link"
// message for all three, not distinguish them, to avoid letting an
// attacker enumerate which failure mode applies.
func (s *Store) GetValidPasswordResetToken(ctx context.Context, tokenHash string) (*PasswordResetToken, error) {
	t := &PasswordResetToken{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT id, mailbox_id, token_hash, created_at, expires_at, used_at
		FROM password_reset_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
	`, tokenHash).Scan(&t.ID, &t.MailboxID, &t.TokenHash, &t.CreatedAt, &t.ExpiresAt, &t.UsedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Store) MarkPasswordResetTokenUsed(ctx context.Context, id string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, id)
	return err
}
