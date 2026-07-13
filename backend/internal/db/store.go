package db

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

var ErrNotFound = errors.New("not found")

type Customer struct {
	ID             string
	Email          string
	Name           string
	FirstName      sql.NullString
	LastName       sql.NullString
	Username       sql.NullString
	PasswordHash   string
	PlanTierID     string
	OrganizationID sql.NullString
	LastSignInAt   sql.NullTime
	CreatedAt      time.Time
}

type Organization struct {
	ID        string
	Name      string
	CreatedAt time.Time
}

// CustomerProfile is the joined view used for the authenticated /api/me
// response - the header needs the organization name and a human-readable
// plan tier name alongside the customer's own fields.
type CustomerProfile struct {
	ID               string
	Email            string
	Name             string
	FirstName        sql.NullString
	LastName         sql.NullString
	Username         sql.NullString
	PlanTierID       string
	PlanTierName     string
	OrganizationID   string
	OrganizationName string
	LastSignInAt     sql.NullTime
}

type Domain struct {
	ID                    string
	CustomerID            string
	Name                  string
	Status                string
	DKIMSelector          sql.NullString
	LastError             sql.NullString
	CreatedAt             time.Time
	VerifiedAt            sql.NullTime
	Notes                 string
	PubliclyListed        bool
	SpamSenderDenylist    string
	SpamSenderJunklist    string
	SpamRecipientDenylist string
	SpamSubjectRewrite    bool
	SpamJunkIfSubjectSpam bool
	DefaultMaySend        bool
	DefaultMayReceive     bool
	DefaultMayIMAP        bool
	DefaultMayPOP3        bool
	DefaultMaySieve       bool
	DefaultMaxEmails      int64
	DefaultMaxDiskQuota   int64
}

type Mailbox struct {
	ID                   string
	DomainID             string
	LocalPart            string
	DisplayName          string
	Status               string
	CreatedAt            time.Time
	MaySend              bool
	MayReceive           bool
	MayIMAP              bool
	MayPOP3              bool
	MaySieve             bool
	InternalAccessOnly   bool
	Delegation           string
	ListingTags          string
	Notes                string
	ExpiresAt            sql.NullTime
	RemoveUponExpiration bool
	MaxEmails            int64
	MaxDiskQuotaBytes    int64
}

type MailboxForward struct {
	ID          string
	MailboxID   string
	Destination string
	CreatedAt   time.Time
}

type ActivityEntry struct {
	ID        string
	DomainID  string
	EventType string
	Message   string
	CreatedAt time.Time
}

type Store struct {
	conn *sql.DB
}

func NewStore(conn *sql.DB) *Store {
	return &Store{conn: conn}
}

// --- organizations ---

func (s *Store) CreateOrganization(ctx context.Context, name string) (*Organization, error) {
	o := &Organization{}
	err := s.conn.QueryRowContext(ctx, `
		INSERT INTO organizations (name)
		VALUES ($1)
		RETURNING id, name, created_at
	`, name).Scan(&o.ID, &o.Name, &o.CreatedAt)
	if err != nil {
		return nil, err
	}
	return o, nil
}

// --- customers ---

func (s *Store) CreateCustomer(ctx context.Context, email, name, passwordHash, organizationID, firstName, lastName, username string) (*Customer, error) {
	c := &Customer{}
	err := s.conn.QueryRowContext(ctx, `
		INSERT INTO customers (email, name, password_hash, organization_id, first_name, last_name, username)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''))
		RETURNING id, email, name, password_hash, plan_tier_id, organization_id, last_sign_in_at, created_at, first_name, last_name, username
	`, email, name, passwordHash, organizationID, firstName, lastName, username).Scan(
		&c.ID, &c.Email, &c.Name, &c.PasswordHash, &c.PlanTierID, &c.OrganizationID, &c.LastSignInAt, &c.CreatedAt,
		&c.FirstName, &c.LastName, &c.Username,
	)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Store) GetCustomerByEmail(ctx context.Context, email string) (*Customer, error) {
	c := &Customer{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT id, email, name, password_hash, plan_tier_id, organization_id, last_sign_in_at, created_at, first_name, last_name, username
		FROM customers WHERE email = $1
	`, email).Scan(&c.ID, &c.Email, &c.Name, &c.PasswordHash, &c.PlanTierID, &c.OrganizationID, &c.LastSignInAt, &c.CreatedAt, &c.FirstName, &c.LastName, &c.Username)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Store) GetCustomerByID(ctx context.Context, id string) (*Customer, error) {
	c := &Customer{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT id, email, name, password_hash, plan_tier_id, organization_id, last_sign_in_at, created_at, first_name, last_name, username
		FROM customers WHERE id = $1
	`, id).Scan(&c.ID, &c.Email, &c.Name, &c.PasswordHash, &c.PlanTierID, &c.OrganizationID, &c.LastSignInAt, &c.CreatedAt, &c.FirstName, &c.LastName, &c.Username)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

// GetCustomerByUsername is used to check username uniqueness before saving.
func (s *Store) GetCustomerByUsername(ctx context.Context, username string) (*Customer, error) {
	c := &Customer{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT id, email, name, password_hash, plan_tier_id, organization_id, last_sign_in_at, created_at, first_name, last_name, username
		FROM customers WHERE username = $1
	`, username).Scan(&c.ID, &c.Email, &c.Name, &c.PasswordHash, &c.PlanTierID, &c.OrganizationID, &c.LastSignInAt, &c.CreatedAt, &c.FirstName, &c.LastName, &c.Username)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

// GetCustomerProfile joins organization name and plan tier name for the
// authenticated /api/me response.
func (s *Store) GetCustomerProfile(ctx context.Context, customerID string) (*CustomerProfile, error) {
	p := &CustomerProfile{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT c.id, c.email, c.name, c.plan_tier_id, pt.name, o.id, o.name, c.last_sign_in_at, c.first_name, c.last_name, c.username
		FROM customers c
		JOIN plan_tiers pt ON pt.id = c.plan_tier_id
		JOIN organizations o ON o.id = c.organization_id
		WHERE c.id = $1
	`, customerID).Scan(&p.ID, &p.Email, &p.Name, &p.PlanTierID, &p.PlanTierName, &p.OrganizationID, &p.OrganizationName, &p.LastSignInAt, &p.FirstName, &p.LastName, &p.Username)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (s *Store) UpdateCustomerName(ctx context.Context, customerID, name string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE customers SET name = $1 WHERE id = $2`, name, customerID)
	return err
}

// UpdateCustomerProfileFields updates the first/last name and username
// collected in the post-signup profile step (and editable later from
// Account > General), recomputing the display `name` from first + last.
func (s *Store) UpdateCustomerProfileFields(ctx context.Context, customerID, firstName, lastName, username string) error {
	name := strings.TrimSpace(firstName + " " + lastName)
	_, err := s.conn.ExecContext(ctx, `
		UPDATE customers SET first_name = NULLIF($1, ''), last_name = NULLIF($2, ''), username = NULLIF($3, ''), name = $4
		WHERE id = $5
	`, firstName, lastName, username, name, customerID)
	return err
}

func (s *Store) UpdateCustomerEmail(ctx context.Context, customerID, email string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE customers SET email = $1 WHERE id = $2`, email, customerID)
	return err
}

func (s *Store) UpdateCustomerPassword(ctx context.Context, customerID, passwordHash string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE customers SET password_hash = $1 WHERE id = $2`, passwordHash, customerID)
	return err
}

func (s *Store) UpdateCustomerLastSignIn(ctx context.Context, customerID string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE customers SET last_sign_in_at = now() WHERE id = $1`, customerID)
	return err
}

// DeleteCustomer removes the customer row. Cascades (via FK) to their
// sessions and domains/mailboxes in our own DB - callers are responsible
// for tearing down the corresponding Stalwart objects first.
func (s *Store) DeleteCustomer(ctx context.Context, customerID string) error {
	_, err := s.conn.ExecContext(ctx, `DELETE FROM customers WHERE id = $1`, customerID)
	return err
}

// --- sessions ---

func (s *Store) CreateSession(ctx context.Context, tokenHash, customerID string, expiresAt time.Time) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO sessions (token_hash, customer_id, expires_at)
		VALUES ($1, $2, $3)
	`, tokenHash, customerID, expiresAt)
	return err
}

func (s *Store) GetCustomerBySessionToken(ctx context.Context, tokenHash string) (*Customer, error) {
	c := &Customer{}
	err := s.conn.QueryRowContext(ctx, `
		SELECT c.id, c.email, c.name, c.password_hash, c.plan_tier_id, c.organization_id, c.last_sign_in_at, c.created_at
		FROM sessions s
		JOIN customers c ON c.id = s.customer_id
		WHERE s.token_hash = $1 AND s.expires_at > now()
	`, tokenHash).Scan(&c.ID, &c.Email, &c.Name, &c.PasswordHash, &c.PlanTierID, &c.OrganizationID, &c.LastSignInAt, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.conn.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash)
	return err
}

// --- domains ---

const domainColumns = `id, customer_id, name, status, dkim_selector, last_error, created_at, verified_at, notes, publicly_listed,
	spam_sender_denylist, spam_sender_junklist, spam_recipient_denylist, spam_subject_rewrite, spam_junk_if_subject_spam,
	default_may_send, default_may_receive, default_may_imap, default_may_pop3, default_may_sieve,
	default_max_emails, default_max_disk_quota_bytes`

func scanDomain(row interface {
	Scan(dest ...any) error
}) (*Domain, error) {
	d := &Domain{}
	err := row.Scan(
		&d.ID, &d.CustomerID, &d.Name, &d.Status, &d.DKIMSelector, &d.LastError, &d.CreatedAt, &d.VerifiedAt, &d.Notes, &d.PubliclyListed,
		&d.SpamSenderDenylist, &d.SpamSenderJunklist, &d.SpamRecipientDenylist, &d.SpamSubjectRewrite, &d.SpamJunkIfSubjectSpam,
		&d.DefaultMaySend, &d.DefaultMayReceive, &d.DefaultMayIMAP, &d.DefaultMayPOP3, &d.DefaultMaySieve,
		&d.DefaultMaxEmails, &d.DefaultMaxDiskQuota,
	)
	return d, err
}

func (s *Store) CreateDomain(ctx context.Context, customerID, name string) (*Domain, error) {
	row := s.conn.QueryRowContext(ctx, `
		INSERT INTO domains (customer_id, name, status)
		VALUES ($1, $2, 'provisioning')
		RETURNING `+domainColumns, customerID, name)
	return scanDomain(row)
}

func (s *Store) ListDomains(ctx context.Context, customerID string) ([]Domain, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT `+domainColumns+`
		FROM domains WHERE customer_id = $1 ORDER BY created_at DESC
	`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Domain
	for rows.Next() {
		d, err := scanDomain(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

func (s *Store) GetDomain(ctx context.Context, customerID, domainID string) (*Domain, error) {
	row := s.conn.QueryRowContext(ctx, `
		SELECT `+domainColumns+`
		FROM domains WHERE id = $1 AND customer_id = $2
	`, domainID, customerID)
	d, err := scanDomain(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return d, nil
}

// GetDomainByID loads a domain without checking ownership - only for
// internal/background use (e.g. the expiration sweep), never from an
// HTTP handler serving a specific customer's request.
func (s *Store) GetDomainByID(ctx context.Context, domainID string) (*Domain, error) {
	row := s.conn.QueryRowContext(ctx, `
		SELECT `+domainColumns+`
		FROM domains WHERE id = $1
	`, domainID)
	d, err := scanDomain(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Store) UpdateDomainStatus(ctx context.Context, domainID, status, lastError string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE domains SET status = $1, last_error = NULLIF($2, '') WHERE id = $3
	`, status, lastError, domainID)
	return err
}

func (s *Store) UpdateDomainNotes(ctx context.Context, domainID, notes string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE domains SET notes = $1 WHERE id = $2`, notes, domainID)
	return err
}

func (s *Store) UpdateDomainListing(ctx context.Context, domainID string, listed bool) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE domains SET publicly_listed = $1 WHERE id = $2`, listed, domainID)
	return err
}

func (s *Store) UpdateSpamSenderLists(ctx context.Context, domainID, denylist, junklist string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE domains SET spam_sender_denylist = $1, spam_sender_junklist = $2 WHERE id = $3
	`, denylist, junklist, domainID)
	return err
}

func (s *Store) UpdateSpamRecipientDenylist(ctx context.Context, domainID, denylist string) error {
	_, err := s.conn.ExecContext(ctx, `UPDATE domains SET spam_recipient_denylist = $1 WHERE id = $2`, denylist, domainID)
	return err
}

func (s *Store) UpdateSpamSubjectSettings(ctx context.Context, domainID string, rewrite, junkIfSpam bool) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE domains SET spam_subject_rewrite = $1, spam_junk_if_subject_spam = $2 WHERE id = $3
	`, rewrite, junkIfSpam, domainID)
	return err
}

// TransferDomain moves a domain to a different customer within our own DB.
// Stalwart doesn't need to know - the domain/mailbox objects there aren't
// owned by any particular Amelu customer, only our own metadata is.
func (s *Store) TransferDomain(ctx context.Context, domainID, newCustomerID string) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE domains SET customer_id = $1 WHERE id = $2`, newCustomerID, domainID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateDomainDKIMSelector(ctx context.Context, domainID, dkimSelector string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE domains SET dkim_selector = $1 WHERE id = $2
	`, dkimSelector, domainID)
	return err
}

// MarkDomainVerified flips a domain to active and stamps verified_at, once
// a live DNS check confirms its records match what Stalwart expects.
func (s *Store) MarkDomainVerified(ctx context.Context, domainID string) error {
	_, err := s.conn.ExecContext(ctx, `
		UPDATE domains SET status = 'active', last_error = NULL, verified_at = now() WHERE id = $1
	`, domainID)
	return err
}

func (s *Store) DeleteDomain(ctx context.Context, customerID, domainID string) error {
	res, err := s.conn.ExecContext(ctx, `DELETE FROM domains WHERE id = $1 AND customer_id = $2`, domainID, customerID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateDomainDefaultServices sets the enabled-services template applied to
// mailboxes created in this domain from now on. Has no effect on mailboxes
// that already exist.
func (s *Store) UpdateDomainDefaultServices(ctx context.Context, domainID string, maySend, mayReceive, mayIMAP, mayPOP3, maySieve bool) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE domains SET default_may_send = $1, default_may_receive = $2, default_may_imap = $3, default_may_pop3 = $4, default_may_sieve = $5
		WHERE id = $6
	`, maySend, mayReceive, mayIMAP, mayPOP3, maySieve, domainID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateDomainDefaultLimits sets the resource-cap template applied to
// mailboxes created in this domain from now on. Has no effect on mailboxes
// that already exist.
func (s *Store) UpdateDomainDefaultLimits(ctx context.Context, domainID string, maxEmails, maxDiskQuotaBytes int64) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE domains SET default_max_emails = $1, default_max_disk_quota_bytes = $2 WHERE id = $3
	`, maxEmails, maxDiskQuotaBytes, domainID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// --- mailboxes ---

const mailboxColumns = `id, domain_id, local_part, display_name, status, created_at,
	may_send, may_receive, may_imap, may_pop3, may_sieve, internal_access_only, delegation, listing_tags, notes,
	expires_at, remove_upon_expiration, max_emails, max_disk_quota_bytes`

func scanMailbox(row interface {
	Scan(dest ...any) error
}) (*Mailbox, error) {
	m := &Mailbox{}
	err := row.Scan(
		&m.ID, &m.DomainID, &m.LocalPart, &m.DisplayName, &m.Status, &m.CreatedAt,
		&m.MaySend, &m.MayReceive, &m.MayIMAP, &m.MayPOP3, &m.MaySieve, &m.InternalAccessOnly, &m.Delegation, &m.ListingTags, &m.Notes,
		&m.ExpiresAt, &m.RemoveUponExpiration, &m.MaxEmails, &m.MaxDiskQuotaBytes,
	)
	return m, err
}

func (s *Store) CreateMailbox(ctx context.Context, domainID, localPart, displayName string) (*Mailbox, error) {
	row := s.conn.QueryRowContext(ctx, `
		INSERT INTO mailboxes (domain_id, local_part, display_name, status)
		VALUES ($1, $2, $3, 'active')
		RETURNING `+mailboxColumns, domainID, localPart, displayName)
	return scanMailbox(row)
}

func (s *Store) ListMailboxes(ctx context.Context, domainID string) ([]Mailbox, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT `+mailboxColumns+`
		FROM mailboxes WHERE domain_id = $1 ORDER BY created_at DESC
	`, domainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Mailbox
	for rows.Next() {
		m, err := scanMailbox(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

func (s *Store) GetMailbox(ctx context.Context, mailboxID string) (*Mailbox, error) {
	row := s.conn.QueryRowContext(ctx, `
		SELECT `+mailboxColumns+`
		FROM mailboxes WHERE id = $1
	`, mailboxID)
	m, err := scanMailbox(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Store) UpdateMailboxDisplayName(ctx context.Context, mailboxID, displayName string) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE mailboxes SET display_name = $1 WHERE id = $2`, displayName, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateMailboxStatus(ctx context.Context, mailboxID, status string) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE mailboxes SET status = $1 WHERE id = $2`, status, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateMailboxServices(ctx context.Context, mailboxID string, maySend, mayReceive, mayIMAP, mayPOP3, maySieve bool) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE mailboxes SET may_send = $1, may_receive = $2, may_imap = $3, may_pop3 = $4, may_sieve = $5 WHERE id = $6
	`, maySend, mayReceive, mayIMAP, mayPOP3, maySieve, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateMailboxInternalAccess(ctx context.Context, mailboxID string, internalOnly bool) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE mailboxes SET internal_access_only = $1 WHERE id = $2`, internalOnly, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateMailboxDelegation(ctx context.Context, mailboxID, delegation string) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE mailboxes SET delegation = $1 WHERE id = $2`, delegation, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateMailboxListing(ctx context.Context, mailboxID, displayName, tags string) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE mailboxes SET display_name = $1, listing_tags = $2 WHERE id = $3`, displayName, tags, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateMailboxNotes(ctx context.Context, mailboxID, notes string) error {
	res, err := s.conn.ExecContext(ctx, `UPDATE mailboxes SET notes = $1 WHERE id = $2`, notes, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateMailboxExpiration(ctx context.Context, mailboxID string, expiresAt *time.Time, removeUponExpiration bool) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE mailboxes SET expires_at = $1, remove_upon_expiration = $2 WHERE id = $3
	`, expiresAt, removeUponExpiration, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UpdateMailboxLimits(ctx context.Context, mailboxID string, maxEmails, maxDiskQuotaBytes int64) error {
	res, err := s.conn.ExecContext(ctx, `
		UPDATE mailboxes SET max_emails = $1, max_disk_quota_bytes = $2 WHERE id = $3
	`, maxEmails, maxDiskQuotaBytes, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// ListExpiredMailboxes returns every non-deleted mailbox whose expires_at
// has passed - polled by the scheduled expiration job in cmd/api/main.go.
func (s *Store) ListExpiredMailboxes(ctx context.Context) ([]Mailbox, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT `+mailboxColumns+`
		FROM mailboxes WHERE expires_at IS NOT NULL AND expires_at <= now() AND status != 'suspended'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Mailbox
	for rows.Next() {
		m, err := scanMailbox(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

func (s *Store) ListMailboxForwards(ctx context.Context, mailboxID string) ([]MailboxForward, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT id, mailbox_id, destination, created_at FROM mailbox_forwards WHERE mailbox_id = $1 ORDER BY created_at
	`, mailboxID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []MailboxForward
	for rows.Next() {
		var f MailboxForward
		if err := rows.Scan(&f.ID, &f.MailboxID, &f.Destination, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) CreateMailboxForward(ctx context.Context, mailboxID, destination string) (*MailboxForward, error) {
	f := &MailboxForward{}
	err := s.conn.QueryRowContext(ctx, `
		INSERT INTO mailbox_forwards (mailbox_id, destination) VALUES ($1, $2)
		RETURNING id, mailbox_id, destination, created_at
	`, mailboxID, destination).Scan(&f.ID, &f.MailboxID, &f.Destination, &f.CreatedAt)
	if err != nil {
		return nil, err
	}
	return f, nil
}

func (s *Store) DeleteMailboxForward(ctx context.Context, mailboxID, id string) error {
	res, err := s.conn.ExecContext(ctx, `DELETE FROM mailbox_forwards WHERE id = $1 AND mailbox_id = $2`, id, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteMailbox(ctx context.Context, mailboxID string) error {
	res, err := s.conn.ExecContext(ctx, `DELETE FROM mailboxes WHERE id = $1`, mailboxID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// --- plan tiers ---

func (s *Store) GetPlanTier(ctx context.Context, id string) (maxDomains, maxMailboxesPerDomain int, err error) {
	err = s.conn.QueryRowContext(ctx, `
		SELECT max_domains, max_mailboxes_per_domain FROM plan_tiers WHERE id = $1
	`, id).Scan(&maxDomains, &maxMailboxesPerDomain)
	return
}

// CountDomains excludes 'failed' domains from the plan limit — a failed
// provisioning attempt never actually occupies a slot in Stalwart.
func (s *Store) CountDomains(ctx context.Context, customerID string) (int, error) {
	var n int
	err := s.conn.QueryRowContext(ctx, `SELECT count(*) FROM domains WHERE customer_id = $1 AND status != 'failed'`, customerID).Scan(&n)
	return n, err
}

func (s *Store) CountMailboxes(ctx context.Context, domainID string) (int, error) {
	var n int
	err := s.conn.QueryRowContext(ctx, `SELECT count(*) FROM mailboxes WHERE domain_id = $1 AND status != 'deleted'`, domainID).Scan(&n)
	return n, err
}

// --- activity log ---

func (s *Store) LogActivity(ctx context.Context, domainID, eventType, message string) error {
	_, err := s.conn.ExecContext(ctx, `
		INSERT INTO activity_log (domain_id, event_type, message)
		VALUES ($1, $2, $3)
	`, domainID, eventType, message)
	return err
}

func (s *Store) ListActivity(ctx context.Context, domainID string, limit int) ([]ActivityEntry, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT id, domain_id, event_type, message, created_at
		FROM activity_log WHERE domain_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, domainID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ActivityEntry
	for rows.Next() {
		var e ActivityEntry
		if err := rows.Scan(&e.ID, &e.DomainID, &e.EventType, &e.Message, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ListActivityForAddress filters the domain's activity log to entries
// mentioning a specific mailbox address - used for the per-mailbox Recent
// Activity page. There's no mailbox_id column on activity_log (events
// like domain creation don't have one), so this matches on message text
// instead, which every mailbox-related LogActivity call already includes
// the full address in.
func (s *Store) ListActivityForAddress(ctx context.Context, domainID, address string, limit int) ([]ActivityEntry, error) {
	rows, err := s.conn.QueryContext(ctx, `
		SELECT id, domain_id, event_type, message, created_at
		FROM activity_log WHERE domain_id = $1 AND message LIKE '%' || $2 || '%'
		ORDER BY created_at DESC
		LIMIT $3
	`, domainID, address, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ActivityEntry
	for rows.Next() {
		var e ActivityEntry
		if err := rows.Scan(&e.ID, &e.DomainID, &e.EventType, &e.Message, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
