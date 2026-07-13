package stalwart

import (
	"context"
	"encoding/json"
	"fmt"
)

// Mailbox is Stalwart's "x:Account" object with type-variant "User" (schema
// x:UserAccount) — confirmed live against marduk.mx.amelu.org. Multi-variant
// objects are discriminated with an "@type" property (found via the
// server's /api/schema form definitions), not a separate method name per
// variant.
type Mailbox struct {
	ID           string `json:"id"`
	Name         string `json:"name"`         // local part only, e.g. "alice"
	EmailAddress string `json:"emailAddress"` // serverSet, derived from name+domainId
}

// CreateMailbox creates a User-variant Account in Stalwart under the domain
// already created via CreateDomain (its Stalwart domainId is resolved
// first, since x:UserAccount.domainId is an object id, not a domain name).
//
// Confirmed live: the initial password credential is created inline via
// credentials: {"0": {"@type": "Password", "secret": ...}} — credentials is
// a map keyed by string index, not a JSON array, despite being described as
// an "objectList" in the schema.
func (c *Client) CreateMailbox(ctx context.Context, localPart, domainName, password string) (*Mailbox, error) {
	domainID, err := c.resolveDomainID(ctx, domainName)
	if err != nil {
		return nil, fmt.Errorf("resolve domain %s for mailbox %s: %w", domainName, localPart, err)
	}

	args := map[string]any{
		"create": map[string]any{
			"a0": map[string]any{
				"@type":    "User",
				"name":     localPart,
				"domainId": domainID,
				"credentials": map[string]any{
					"0": map[string]any{
						"@type":  "Password",
						"secret": password,
					},
				},
			},
		},
	}
	raw, err := c.call(ctx, "x:Account/set", args)
	if err != nil {
		return nil, fmt.Errorf("create mailbox %s@%s: %w", localPart, domainName, err)
	}

	var result struct {
		Created    map[string]json.RawMessage `json:"created"`
		NotCreated map[string]json.RawMessage `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode create mailbox response: %w", err)
	}
	if notCreated, ok := result.NotCreated["a0"]; ok {
		return nil, fmt.Errorf("stalwart rejected mailbox %s@%s: %s", localPart, domainName, notCreated)
	}
	created, ok := result.Created["a0"]
	if !ok {
		return nil, fmt.Errorf("stalwart did not confirm creation of mailbox %s@%s", localPart, domainName)
	}

	var m Mailbox
	if err := json.Unmarshal(created, &m); err != nil {
		return nil, fmt.Errorf("decode created mailbox: %w", err)
	}
	m.Name = localPart
	if m.EmailAddress == "" {
		m.EmailAddress = localPart + "@" + domainName
	}
	return &m, nil
}

// resolveAccountID looks up an Account's server-assigned id by localPart +
// domain. Confirmed live: x:Account/query rejects a direct "emailAddress"
// filter ("unsupportedFilter"); "name" + "domainId" (matching the live
// schema's documented filterable fields for the x:Account/User list view)
// is what actually works.
func (c *Client) resolveAccountID(ctx context.Context, localPart, domainName string) (string, error) {
	domainID, err := c.resolveDomainID(ctx, domainName)
	if err != nil {
		return "", fmt.Errorf("resolve domain %s for mailbox %s: %w", domainName, localPart, err)
	}

	args := map[string]any{
		"filter": map[string]any{
			"name":     localPart,
			"domainId": domainID,
		},
	}
	raw, err := c.call(ctx, "x:Account/query", args)
	if err != nil {
		return "", fmt.Errorf("query mailbox %s@%s: %w", localPart, domainName, err)
	}

	var result struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("decode query mailbox response: %w", err)
	}
	if len(result.IDs) == 0 {
		return "", fmt.Errorf("mailbox %s@%s: %w", localPart, domainName, ErrNotFound)
	}
	return result.IDs[0], nil
}

// DeleteMailbox destroys an Account in Stalwart.
func (c *Client) DeleteMailbox(ctx context.Context, localPart, domainName string) error {
	id, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return err
	}

	raw, err := c.call(ctx, "x:Account/set", map[string]any{"destroy": []string{id}})
	if err != nil {
		return fmt.Errorf("delete mailbox %s@%s: %w", localPart, domainName, err)
	}

	var result struct {
		NotDestroyed map[string]json.RawMessage `json:"notDestroyed"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode delete mailbox response: %w", err)
	}
	if reason, ok := result.NotDestroyed[id]; ok {
		return fmt.Errorf("stalwart refused to delete mailbox %s@%s: %s", localPart, domainName, reason)
	}
	return nil
}

// SuspendMailbox blocks a mailbox from authenticating by expiring its
// password credential, confirmed live: a slash-delimited partial-update key
// ("credentials/0/expiresAt") patches a single nested field without
// requiring the plaintext secret to be resent (which a whole-object
// replace of "credentials" would otherwise demand, since Stalwart never
// returns secrets in plaintext).
//
// This assumes the mailbox's password credential is always at index 0,
// true for every mailbox this API creates (CreateMailbox always writes
// exactly one credential at "0").
func (c *Client) SuspendMailbox(ctx context.Context, localPart, domainName string) error {
	id, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return err
	}

	args := map[string]any{
		"update": map[string]any{
			id: map[string]any{
				"credentials/0/expiresAt": "1970-01-01T00:00:00Z",
			},
		},
	}
	raw, err := c.call(ctx, "x:Account/set", args)
	if err != nil {
		return fmt.Errorf("suspend mailbox %s@%s: %w", localPart, domainName, err)
	}

	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode suspend mailbox response: %w", err)
	}
	if reason, ok := result.NotUpdated[id]; ok {
		return fmt.Errorf("stalwart refused to suspend mailbox %s@%s: %s", localPart, domainName, reason)
	}
	return nil
}

// ActivateMailbox reverses SuspendMailbox by clearing the password
// credential's expiresAt back to null. Confirmed live: the same
// slash-path partial update accepts a JSON null to clear the field,
// without needing to resend the secret.
func (c *Client) ActivateMailbox(ctx context.Context, localPart, domainName string) error {
	id, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return err
	}

	args := map[string]any{
		"update": map[string]any{
			id: map[string]any{
				"credentials/0/expiresAt": nil,
			},
		},
	}
	raw, err := c.call(ctx, "x:Account/set", args)
	if err != nil {
		return fmt.Errorf("activate mailbox %s@%s: %w", localPart, domainName, err)
	}

	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode activate mailbox response: %w", err)
	}
	if reason, ok := result.NotUpdated[id]; ok {
		return fmt.Errorf("stalwart refused to activate mailbox %s@%s: %s", localPart, domainName, reason)
	}
	return nil
}
