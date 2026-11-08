package stalwart

import (
	"context"
	"encoding/json"
	"fmt"
)

// AccountStorage is how much mail one account holds, by its local part.
// MaxBytes is 0 when the account has no disk quota of its own.
type AccountStorage struct {
	Name      string
	UsedBytes int64
	MaxBytes  int64
}

// DomainStorage returns every account on the domain with its disk use.
// Confirmed live: x:Account/query accepts a filter on domainId alone, and
// usedDiskQuota is the bytes the account's mail takes up.
func (c *Client) DomainStorage(ctx context.Context, domainName string) ([]AccountStorage, error) {
	domainID, err := c.resolveDomainID(ctx, domainName)
	if err != nil {
		return nil, err
	}
	raw, err := c.call(ctx, "x:Account/query", map[string]any{"filter": map[string]any{"domainId": domainID}, "limit": 5000})
	if err != nil {
		return nil, fmt.Errorf("query accounts of %s: %w", domainName, err)
	}
	var q struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &q); err != nil {
		return nil, fmt.Errorf("decode account query: %w", err)
	}
	if len(q.IDs) == 0 {
		return nil, nil
	}
	raw, err = c.call(ctx, "x:Account/get", map[string]any{"ids": q.IDs, "properties": []string{"name", "usedDiskQuota", "quotas"}})
	if err != nil {
		return nil, fmt.Errorf("get accounts of %s: %w", domainName, err)
	}
	var g struct {
		List []struct {
			Name   string `json:"name"`
			Used   int64  `json:"usedDiskQuota"`
			Quotas struct {
				MaxDiskQuota int64 `json:"maxDiskQuota"`
			} `json:"quotas"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &g); err != nil {
		return nil, fmt.Errorf("decode accounts: %w", err)
	}
	out := make([]AccountStorage, 0, len(g.List))
	for _, a := range g.List {
		out = append(out, AccountStorage{Name: a.Name, UsedBytes: a.Used, MaxBytes: a.Quotas.MaxDiskQuota})
	}
	return out, nil
}
