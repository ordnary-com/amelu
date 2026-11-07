package db

import "context"

type OnboardingAnswers struct {
	UseCase      string
	TeamSize     string
	Source       string
	SourceDetail string
}

// CompleteOnboarding stores the answers and marks the customer onboarded. A
// second call (another tab) keeps the first answers.
func (s *Store) CompleteOnboarding(ctx context.Context, customerID, organizationID string, a OnboardingAnswers) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO onboarding_answers (customer_id, organization_id, use_case, team_size, source, source_detail)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (customer_id) DO NOTHING`,
		customerID, organizationID, a.UseCase, a.TeamSize, a.Source, a.SourceDetail); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE customers SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = $1`, customerID); err != nil {
		return err
	}
	return tx.Commit()
}
