package stalwart

import (
	"context"
	"encoding/json"
	"fmt"
)

type Domain struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	IsEnabled       bool            `json:"isEnabled"`
	DNSZoneFile     string          `json:"dnsZoneFile"`
	Aliases         map[string]bool `json:"aliases"`
	CatchAllAddress *string         `json:"catchAllAddress"`
}

// CreateDomain creates a Domain object in Stalwart. It does not itself
// configure DKIM/DNS management mode; Stalwart defaults apply.
func (c *Client) CreateDomain(ctx context.Context, name string) (*Domain, error) {
	args := map[string]any{
		"create": map[string]any{
			"d0": map[string]any{
				"name": name,
			},
		},
	}
	raw, err := c.call(ctx, "x:Domain/set", args)
	if err != nil {
		return nil, fmt.Errorf("create domain %s: %w", name, err)
	}

	var result struct {
		Created    map[string]json.RawMessage `json:"created"`
		NotCreated map[string]json.RawMessage `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode create domain response: %w", err)
	}
	if notCreated, ok := result.NotCreated["d0"]; ok {
		return nil, fmt.Errorf("stalwart rejected domain %s: %s", name, notCreated)
	}
	created, ok := result.Created["d0"]
	if !ok {
		return nil, fmt.Errorf("stalwart did not confirm creation of domain %s", name)
	}

	var d Domain
	if err := json.Unmarshal(created, &d); err != nil {
		return nil, fmt.Errorf("decode created domain: %w", err)
	}
	d.Name = name
	return &d, nil
}

// resolveDomainID looks up a Domain's server-assigned id by name via
// x:Domain/query. Confirmed live: ids are short opaque server-assigned
// tokens (e.g. "c"), never the domain name itself — there is no valid
// fallback if the query comes back empty, so that's ErrNotFound.
func (c *Client) resolveDomainID(ctx context.Context, name string) (string, error) {
	args := map[string]any{
		"filter": map[string]any{
			"name": name,
		},
	}
	raw, err := c.call(ctx, "x:Domain/query", args)
	if err != nil {
		return "", fmt.Errorf("query domain %s: %w", name, err)
	}

	var result struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("decode query domain response: %w", err)
	}
	if len(result.IDs) == 0 {
		return "", fmt.Errorf("domain %s: %w", name, ErrNotFound)
	}
	return result.IDs[0], nil
}

// GetDomain fetches a Domain by name, including its server-computed expected
// DNS zone file (dnsZoneFile), which is used as the source of truth for the
// MX/SPF/DKIM/DMARC records pushed to Cloudflare.
func (c *Client) GetDomain(ctx context.Context, name string) (*Domain, error) {
	id, err := c.resolveDomainID(ctx, name)
	if err != nil {
		return nil, err
	}

	args := map[string]any{
		"ids":        []string{id},
		"properties": []string{"name", "isEnabled", "dnsZoneFile", "aliases", "catchAllAddress"},
	}
	raw, err := c.call(ctx, "x:Domain/get", args)
	if err != nil {
		return nil, fmt.Errorf("get domain %s: %w", name, err)
	}

	var result struct {
		List []Domain `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode get domain response: %w", err)
	}
	if len(result.List) == 0 {
		return nil, fmt.Errorf("domain %s: %w", name, ErrNotFound)
	}
	d := result.List[0]
	return &d, nil
}

// DeleteDomain destroys a Domain object in Stalwart.
//
// Confirmed live: Stalwart refuses to destroy a Domain that still has
// DkimSignature objects linked to it (objectIsLinked) — every domain gets
// auto-generated DKIM signatures on creation, so this must clean those up
// first or domain deletion always fails.
func (c *Client) DeleteDomain(ctx context.Context, name string) error {
	id, err := c.resolveDomainID(ctx, name)
	if err != nil {
		return err
	}

	if err := c.destroyLinkedDkimSignatures(ctx, id); err != nil {
		return fmt.Errorf("delete domain %s: %w", name, err)
	}

	args := map[string]any{
		"destroy": []string{id},
	}
	raw, err := c.call(ctx, "x:Domain/set", args)
	if err != nil {
		return fmt.Errorf("delete domain %s: %w", name, err)
	}

	var result struct {
		Destroyed    []string                   `json:"destroyed"`
		NotDestroyed map[string]json.RawMessage `json:"notDestroyed"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode delete domain response: %w", err)
	}
	if reason, ok := result.NotDestroyed[id]; ok {
		return fmt.Errorf("stalwart refused to delete domain %s: %s", name, reason)
	}
	return nil
}

// updateDomainField applies a single partial-update field to a Domain,
// shared by the alias/catchall/enabled mutators below.
func (c *Client) updateDomainField(ctx context.Context, name string, field string, value any) error {
	id, err := c.resolveDomainID(ctx, name)
	if err != nil {
		return err
	}

	raw, err := c.call(ctx, "x:Domain/set", map[string]any{
		"update": map[string]any{
			id: map[string]any{field: value},
		},
	})
	if err != nil {
		return fmt.Errorf("update domain %s %s: %w", name, field, err)
	}

	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode update domain response: %w", err)
	}
	if reason, ok := result.NotUpdated[id]; ok {
		return fmt.Errorf("stalwart refused to update domain %s %s: %s", name, field, reason)
	}
	return nil
}

// AddDomainAlias adds an alternate domain name as an alias of domain.
// Confirmed live: Domain.aliases is a JMAP "set" field, patched as
// {"<alias>": true} to add - not a plain array or an objectList-style
// index map like credentials/EmailAlias use.
func (c *Client) AddDomainAlias(ctx context.Context, domainName, aliasDomain string) error {
	return c.updateDomainField(ctx, domainName, "aliases", map[string]any{aliasDomain: true})
}

// RemoveDomainAlias removes a previously added domain alias. Confirmed
// live: removal uses "false" (not null, which Stalwart rejects as an
// "invalid key" here).
func (c *Client) RemoveDomainAlias(ctx context.Context, domainName, aliasDomain string) error {
	return c.updateDomainField(ctx, domainName, "aliases", map[string]any{aliasDomain: false})
}

// SetCatchAllAddress sets (or, with an empty string, clears) the domain's
// catch-all recipient. Confirmed live: a plain string value, not the
// set/objectList conventions the other two mutators need.
func (c *Client) SetCatchAllAddress(ctx context.Context, domainName, address string) error {
	var value any = address
	if address == "" {
		value = nil
	}
	return c.updateDomainField(ctx, domainName, "catchAllAddress", value)
}

// SetDomainEnabled toggles the domain on/off (Deactivate/Reactivate) without
// touching anything else - mailboxes, DNS records, and DKIM keys are left
// alone, unlike DeleteDomain which tears all of that down.
func (c *Client) SetDomainEnabled(ctx context.Context, domainName string, enabled bool) error {
	return c.updateDomainField(ctx, domainName, "isEnabled", enabled)
}

func (c *Client) destroyLinkedDkimSignatures(ctx context.Context, domainID string) error {
	raw, err := c.call(ctx, "x:DkimSignature/query", map[string]any{
		"filter": map[string]any{"domainId": domainID},
	})
	if err != nil {
		return fmt.Errorf("query dkim signatures: %w", err)
	}

	var queryResult struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &queryResult); err != nil {
		return fmt.Errorf("decode dkim signature query response: %w", err)
	}
	if len(queryResult.IDs) == 0 {
		return nil
	}

	setRaw, err := c.call(ctx, "x:DkimSignature/set", map[string]any{"destroy": queryResult.IDs})
	if err != nil {
		return fmt.Errorf("destroy dkim signatures: %w", err)
	}
	var setResult struct {
		NotDestroyed map[string]json.RawMessage `json:"notDestroyed"`
	}
	if err := json.Unmarshal(setRaw, &setResult); err != nil {
		return fmt.Errorf("decode dkim signature destroy response: %w", err)
	}
	if len(setResult.NotDestroyed) > 0 {
		return fmt.Errorf("could not remove dkim signatures: %v", setResult.NotDestroyed)
	}
	return nil
}
