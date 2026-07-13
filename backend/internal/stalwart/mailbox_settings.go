package stalwart

import (
	"context"
	"encoding/json"
	"fmt"
)

// SetMailboxPassword replaces localPart@domainName's password credential.
// Uses the same "credentials/0" slot CreateMailbox sets at creation time.
func (c *Client) SetMailboxPassword(ctx context.Context, localPart, domainName, newPassword string) error {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return fmt.Errorf("resolve account for password change: %w", err)
	}

	raw, err := c.call(ctx, "x:Account/set", map[string]any{
		"update": map[string]any{
			accountID: map[string]any{
				"credentials/0": map[string]any{
					"@type":  "Password",
					"secret": newPassword,
				},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("set password for %s@%s: %w", localPart, domainName, err)
	}
	return checkNotUpdated(raw, accountID, "set password", localPart, domainName)
}

// SetMailboxQuotas sets localPart@domainName's absolute resource caps.
// maxEmails and maxDiskQuotaBytes are each omitted from the update
// entirely when 0 (meaning "not configured by us") rather than sent as a
// literal 0 - Stalwart's own meaning for a literal 0 quota isn't
// confirmed, so this avoids accidentally locking an account out.
func (c *Client) SetMailboxQuotas(ctx context.Context, localPart, domainName string, maxEmails, maxDiskQuotaBytes int64) error {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return fmt.Errorf("resolve account for quota change: %w", err)
	}

	quotas := map[string]any{}
	if maxEmails > 0 {
		quotas["maxEmails"] = maxEmails
	}
	if maxDiskQuotaBytes > 0 {
		quotas["maxDiskQuota"] = maxDiskQuotaBytes
	}

	raw, err := c.call(ctx, "x:Account/set", map[string]any{
		"update": map[string]any{
			accountID: map[string]any{"quotas": quotas},
		},
	})
	if err != nil {
		return fmt.Errorf("set quotas for %s@%s: %w", localPart, domainName, err)
	}
	return checkNotUpdated(raw, accountID, "set quotas", localPart, domainName)
}

// mailboxPermission names the subset of Stalwart's ~660 granular
// permissions that map onto Migadu's "Enabled Services" toggles. Confirmed
// live: disabling imapAuthenticate genuinely blocks IMAP login (and
// re-enabling restores it) - this isn't just an accepted-but-inert flag.
const (
	PermissionEmailSend         = "emailSend"
	PermissionEmailReceive      = "emailReceive"
	PermissionIMAPAuthenticate  = "imapAuthenticate"
	PermissionPOP3Authenticate  = "pop3Authenticate"
	PermissionSieveAuthenticate = "sieveAuthenticate"
)

// SetMailboxDisabledPermissions sets which of the mailboxPermission
// constants are disabled for localPart@domainName - everything not listed
// is left at its inherited (enabled) default. Confirmed live: the
// "disabledPermissions"/"enabledPermissions" set-type fields use the same
// {"name": true} object-map convention as Domain.aliases, not a plain
// array (a plain array is rejected with invalidPatch).
func (c *Client) SetMailboxDisabledPermissions(ctx context.Context, localPart, domainName string, disabled []string) error {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return fmt.Errorf("resolve account for permissions change: %w", err)
	}

	var permissions any
	if len(disabled) == 0 {
		permissions = map[string]any{"@type": "Inherit"}
	} else {
		disabledMap := make(map[string]any, len(disabled))
		for _, p := range disabled {
			disabledMap[p] = true
		}
		permissions = map[string]any{
			"@type":               "Merge",
			"disabledPermissions": disabledMap,
			"enabledPermissions":  map[string]any{},
		}
	}

	raw, err := c.call(ctx, "x:Account/set", map[string]any{
		"update": map[string]any{
			accountID: map[string]any{"permissions": permissions},
		},
	})
	if err != nil {
		return fmt.Errorf("set permissions for %s@%s: %w", localPart, domainName, err)
	}
	return checkNotUpdated(raw, accountID, "set permissions", localPart, domainName)
}

func checkNotUpdated(raw json.RawMessage, accountID, action, localPart, domainName string) error {
	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode %s response: %w", action, err)
	}
	if reason, ok := result.NotUpdated[accountID]; ok {
		return fmt.Errorf("stalwart refused to %s for %s@%s: %s", action, localPart, domainName, reason)
	}
	return nil
}

// Identity is a JMAP mail submission identity - an alternate From address
// this mailbox can send as. Standard JMAP (urn:ietf:params:jmap:submission),
// confirmed live to work against Stalwart via Identity/get.
type Identity struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// ListIdentities returns every Identity on localPart@domainName's own JMAP
// account (its accountId, not ours - Identity/get is scoped per-account
// like Email/SieveScript).
func (c *Client) ListIdentities(ctx context.Context, localPart, domainName string) ([]Identity, error) {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return nil, fmt.Errorf("resolve account for identities: %w", err)
	}
	raw, err := c.call(ctx, "Identity/get", map[string]any{"accountId": accountID, "ids": nil})
	if err != nil {
		return nil, fmt.Errorf("list identities for %s@%s: %w", localPart, domainName, err)
	}
	var result struct {
		List []Identity `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode identities response: %w", err)
	}
	return result.List, nil
}

// CreateIdentity adds a new send-as identity to localPart@domainName.
func (c *Client) CreateIdentity(ctx context.Context, localPart, domainName, name, email string) (*Identity, error) {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return nil, fmt.Errorf("resolve account for identity creation: %w", err)
	}
	raw, err := c.call(ctx, "Identity/set", map[string]any{
		"accountId": accountID,
		"create": map[string]any{
			"i0": map[string]any{"name": name, "email": email},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("create identity for %s@%s: %w", localPart, domainName, err)
	}
	var result struct {
		Created    map[string]json.RawMessage `json:"created"`
		NotCreated map[string]json.RawMessage `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode create identity response: %w", err)
	}
	if reason, ok := result.NotCreated["i0"]; ok {
		return nil, fmt.Errorf("stalwart refused identity %s for %s@%s: %s", email, localPart, domainName, reason)
	}
	var id Identity
	if err := json.Unmarshal(result.Created["i0"], &id); err != nil {
		return nil, fmt.Errorf("decode created identity: %w", err)
	}
	id.Name = name
	id.Email = email
	return &id, nil
}

// DeleteIdentity removes an identity by id from localPart@domainName.
func (c *Client) DeleteIdentity(ctx context.Context, localPart, domainName, identityID string) error {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return fmt.Errorf("resolve account for identity deletion: %w", err)
	}
	raw, err := c.call(ctx, "Identity/set", map[string]any{
		"accountId": accountID,
		"destroy":   []string{identityID},
	})
	if err != nil {
		return fmt.Errorf("delete identity %s for %s@%s: %w", identityID, localPart, domainName, err)
	}
	var result struct {
		NotDestroyed map[string]json.RawMessage `json:"notDestroyed"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode delete identity response: %w", err)
	}
	if reason, ok := result.NotDestroyed[identityID]; ok {
		return fmt.Errorf("stalwart refused to delete identity %s: %s", identityID, reason)
	}
	return nil
}

// RecentEmail is a lightweight summary of one email, used for Recent Logs.
type RecentEmail struct {
	ID         string   `json:"id"`
	Subject    string   `json:"subject"`
	From       []string `json:"from"`
	To         []string `json:"to"`
	ReceivedAt string   `json:"receivedAt"`
}

// ListRecentEmails returns the most recent emails in the named system
// mailbox ("inbox" or "sent") for localPart@domainName, newest first.
func (c *Client) ListRecentEmails(ctx context.Context, localPart, domainName, role string, limit int) ([]RecentEmail, error) {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return nil, fmt.Errorf("resolve account for recent emails: %w", err)
	}

	raw, err := c.call(ctx, "Mailbox/query", map[string]any{
		"accountId": accountID,
		"filter":    map[string]any{"role": role},
	})
	if err != nil {
		return nil, fmt.Errorf("find %s mailbox for %s@%s: %w", role, localPart, domainName, err)
	}
	var mailboxQuery struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &mailboxQuery); err != nil {
		return nil, fmt.Errorf("decode mailbox query response: %w", err)
	}
	if len(mailboxQuery.IDs) == 0 {
		return []RecentEmail{}, nil
	}

	raw, err = c.call(ctx, "Email/query", map[string]any{
		"accountId": accountID,
		"filter":    map[string]any{"inMailbox": mailboxQuery.IDs[0]},
		"sort":      []map[string]any{{"property": "receivedAt", "isAscending": false}},
		"limit":     limit,
	})
	if err != nil {
		return nil, fmt.Errorf("query emails for %s@%s: %w", localPart, domainName, err)
	}
	var emailQuery struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &emailQuery); err != nil {
		return nil, fmt.Errorf("decode email query response: %w", err)
	}
	if len(emailQuery.IDs) == 0 {
		return []RecentEmail{}, nil
	}

	raw, err = c.call(ctx, "Email/get", map[string]any{
		"accountId":  accountID,
		"ids":        emailQuery.IDs,
		"properties": []string{"subject", "from", "to", "receivedAt"},
	})
	if err != nil {
		return nil, fmt.Errorf("get emails for %s@%s: %w", localPart, domainName, err)
	}
	var emailGet struct {
		List []struct {
			ID      string `json:"id"`
			Subject string `json:"subject"`
			From    []struct {
				Email string `json:"email"`
			} `json:"from"`
			To []struct {
				Email string `json:"email"`
			} `json:"to"`
			ReceivedAt string `json:"receivedAt"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &emailGet); err != nil {
		return nil, fmt.Errorf("decode email get response: %w", err)
	}

	out := make([]RecentEmail, 0, len(emailGet.List))
	for _, e := range emailGet.List {
		re := RecentEmail{ID: e.ID, Subject: e.Subject, ReceivedAt: e.ReceivedAt}
		for _, f := range e.From {
			re.From = append(re.From, f.Email)
		}
		for _, t := range e.To {
			re.To = append(re.To, t.Email)
		}
		out = append(out, re)
	}
	return out, nil
}
