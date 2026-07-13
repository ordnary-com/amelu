package stalwart

import (
	"context"
	"encoding/json"
	"fmt"
)

// AccountAlias is one entry from an Account's aliases field. Confirmed
// live: this is an objectList keyed by string index (like credentials),
// not the plain "set" convention Domain.aliases uses - different field,
// different representation, despite the similar name.
type AccountAlias struct {
	Index    string `json:"-"`
	Name     string `json:"name"`
	DomainID string `json:"domainId"`
	Enabled  bool   `json:"enabled"`
}

// ListAccountAliases returns every alias currently on the mailbox at
// localPart@domainName, alongside the index key each one lives at (needed
// to remove a specific one later).
func (c *Client) ListAccountAliases(ctx context.Context, localPart, domainName string) ([]AccountAlias, error) {
	id, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return nil, err
	}

	raw, err := c.call(ctx, "x:Account/get", map[string]any{
		"ids":        []string{id},
		"properties": []string{"aliases"},
	})
	if err != nil {
		return nil, fmt.Errorf("get aliases for %s@%s: %w", localPart, domainName, err)
	}

	var result struct {
		List []struct {
			Aliases map[string]AccountAlias `json:"aliases"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode aliases response: %w", err)
	}
	if len(result.List) == 0 {
		return nil, fmt.Errorf("mailbox %s@%s: %w", localPart, domainName, ErrNotFound)
	}

	out := make([]AccountAlias, 0, len(result.List[0].Aliases))
	for idx, a := range result.List[0].Aliases {
		a.Index = idx
		out = append(out, a)
	}
	return out, nil
}

// AddAccountAlias registers aliasLocalPart@domainName as an additional
// address delivering to the mailbox at destinationLocalPart@domainName.
// Confirmed live: Stalwart enforces the alias email as globally unique per
// domain (primaryKeyViolation otherwise), so unlike Migadu, one alias can
// only ever point at a single mailbox here - there's no group/list object
// in this schema that would let one address fan out to several accounts.
func (c *Client) AddAccountAlias(ctx context.Context, destinationLocalPart, domainName, aliasLocalPart string) error {
	accountID, err := c.resolveAccountID(ctx, destinationLocalPart, domainName)
	if err != nil {
		return err
	}
	domainID, err := c.resolveDomainID(ctx, domainName)
	if err != nil {
		return err
	}

	aliases, err := c.ListAccountAliases(ctx, destinationLocalPart, domainName)
	if err != nil {
		return err
	}
	nextIndex := len(aliases)

	raw, err := c.call(ctx, "x:Account/set", map[string]any{
		"update": map[string]any{
			accountID: map[string]any{
				fmt.Sprintf("aliases/%d", nextIndex): map[string]any{
					"name":     aliasLocalPart,
					"domainId": domainID,
					"enabled":  true,
				},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("add alias %s to %s@%s: %w", aliasLocalPart, destinationLocalPart, domainName, err)
	}

	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode add alias response: %w", err)
	}
	if reason, ok := result.NotUpdated[accountID]; ok {
		return fmt.Errorf("stalwart refused to add alias %s to %s@%s: %s", aliasLocalPart, destinationLocalPart, domainName, reason)
	}
	return nil
}

// RemoveAccountAlias removes the alias at the given index from a mailbox's
// aliases list (see ListAccountAliases for how to find the index).
func (c *Client) RemoveAccountAlias(ctx context.Context, localPart, domainName, index string) error {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return err
	}

	raw, err := c.call(ctx, "x:Account/set", map[string]any{
		"update": map[string]any{
			accountID: map[string]any{
				fmt.Sprintf("aliases/%s", index): nil,
			},
		},
	})
	if err != nil {
		return fmt.Errorf("remove alias from %s@%s: %w", localPart, domainName, err)
	}

	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode remove alias response: %w", err)
	}
	if reason, ok := result.NotUpdated[accountID]; ok {
		return fmt.Errorf("stalwart refused to remove alias from %s@%s: %s", localPart, domainName, reason)
	}
	return nil
}
