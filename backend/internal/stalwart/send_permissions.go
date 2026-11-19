package stalwart

import (
	"context"
	"encoding/json"
	"fmt"
)

// AccountSendState says whether one account on a domain has emailSend
// disabled, by its local part.
type AccountSendState struct {
	Name         string
	SendDisabled bool
}

// DomainSendStates reads every account on the domain with its emailSend
// permission. Read only: x:Account/query and x:Account/get. Confirmed live:
// permissions comes back as {"@type": "Inherit"} for default accounts, and
// the sender guard's pause (ops/marduk/amelu-sender-guard.py) as
// {"@type": "Merge", "disabledPermissions": {"emailSend": true}, ...}.
func (c *Client) DomainSendStates(ctx context.Context, domainName string) ([]AccountSendState, error) {
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
	raw, err = c.call(ctx, "x:Account/get", map[string]any{"ids": q.IDs, "properties": []string{"name", "permissions"}})
	if err != nil {
		return nil, fmt.Errorf("get accounts of %s: %w", domainName, err)
	}
	var g struct {
		List []struct {
			Name        string `json:"name"`
			Permissions struct {
				Disabled map[string]bool `json:"disabledPermissions"`
			} `json:"permissions"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &g); err != nil {
		return nil, fmt.Errorf("decode accounts: %w", err)
	}
	out := make([]AccountSendState, 0, len(g.List))
	for _, a := range g.List {
		out = append(out, AccountSendState{Name: a.Name, SendDisabled: a.Permissions.Disabled[PermissionEmailSend]})
	}
	return out, nil
}
