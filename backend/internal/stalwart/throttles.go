package stalwart

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// OutboundThrottle is an x:MtaOutboundThrottle rule: Stalwart holds mail in
// the queue once its key (here: the sender domain) has sent Count messages
// within PeriodMs, for messages where Match evaluates true.
type OutboundThrottle struct {
	ID          string
	Description string
	Enable      bool
	// If is the condition; empty means the rule never matches. With Negate,
	// the rule matches everything except where If holds.
	If       string
	Negate   bool
	Count    int
	PeriodMs int64
}

type throttleWire struct {
	ID          string          `json:"id,omitempty"`
	Enable      bool            `json:"enable"`
	Description string          `json:"description"`
	Key         map[string]bool `json:"key"`
	Match       json.RawMessage `json:"match"`
	Rate        struct {
		Count  int   `json:"count"`
		Period int64 `json:"period"`
	} `json:"rate"`
}

// notLocal is every rule's first condition: Stalwart runs outbound throttles
// on the local queue too, so without it a full limit also held mail coming in
// for our own mailboxes until the next hour (devlog 2026-11-04).
var notLocal = map[string]any{"if": "queue_name == 'local'", "then": "false"}

func (t OutboundThrottle) match() map[string]any {
	then, otherwise := "true", "false"
	if t.Negate {
		then, otherwise = "false", "true"
	}
	if t.If == "" {
		return map[string]any{"match": map[string]any{"0": notLocal}, "else": otherwise}
	}
	return map[string]any{"match": map[string]any{"0": notLocal, "1": map[string]any{"if": t.If, "then": then}}, "else": otherwise}
}

func (t OutboundThrottle) wire() map[string]any {
	return map[string]any{
		"enable":      t.Enable,
		"description": t.Description,
		"key":         map[string]bool{"senderDomain": true},
		"match":       t.match(),
		"rate":        map[string]any{"count": t.Count, "period": t.PeriodMs},
	}
}

// ListOutboundThrottles returns every outbound throttle rule, raw, keyed by
// description, for callers that manage their own rules by name.
func (c *Client) ListOutboundThrottles(ctx context.Context) (map[string]string, error) {
	raw, err := c.call(ctx, "x:MtaOutboundThrottle/get", map[string]any{"ids": nil})
	if err != nil {
		return nil, err
	}
	var res struct {
		List []throttleWire `json:"list"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return nil, fmt.Errorf("decode outbound throttles: %w", err)
	}
	out := map[string]string{}
	for _, t := range res.List {
		out[t.Description] = t.ID
	}
	return out, nil
}

// PutOutboundThrottle creates the rule, or replaces the one with id.
func (c *Client) PutOutboundThrottle(ctx context.Context, id string, t OutboundThrottle) error {
	var args map[string]any
	if id == "" {
		args = map[string]any{"create": map[string]any{"t": t.wire()}}
	} else {
		args = map[string]any{"update": map[string]any{id: t.wire()}}
	}
	raw, err := c.call(ctx, "x:MtaOutboundThrottle/set", args)
	if err != nil {
		return err
	}
	var res struct {
		NotCreated map[string]json.RawMessage `json:"notCreated"`
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return fmt.Errorf("decode throttle set: %w", err)
	}
	for _, e := range res.NotCreated {
		return fmt.Errorf("throttle %q not created: %s", t.Description, e)
	}
	for _, e := range res.NotUpdated {
		return fmt.Errorf("throttle %q not updated: %s", t.Description, e)
	}
	return nil
}

// DomainAliases maps every Stalwart domain name to its enabled alias domains.
func (c *Client) DomainAliases(ctx context.Context) (map[string][]string, error) {
	raw, err := c.call(ctx, "x:Domain/query", map[string]any{})
	if err != nil {
		return nil, err
	}
	var q struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &q); err != nil {
		return nil, fmt.Errorf("decode domain query: %w", err)
	}
	out := map[string][]string{}
	for i := 0; i < len(q.IDs); i += 200 {
		end := min(i+200, len(q.IDs))
		raw, err := c.call(ctx, "x:Domain/get", map[string]any{"ids": q.IDs[i:end], "properties": []string{"name", "aliases"}})
		if err != nil {
			return nil, err
		}
		var res struct {
			List []Domain `json:"list"`
		}
		if err := json.Unmarshal(raw, &res); err != nil {
			return nil, fmt.Errorf("decode domains: %w", err)
		}
		for _, d := range res.List {
			name := strings.ToLower(d.Name)
			for alias, on := range d.Aliases {
				if on {
					out[name] = append(out[name], strings.ToLower(alias))
				}
			}
		}
	}
	return out, nil
}

// ReloadSettings makes Stalwart pick up changed configuration objects.
func (c *Client) ReloadSettings(ctx context.Context) error {
	_, err := c.call(ctx, "x:Action/set", map[string]any{"create": map[string]any{"a": map[string]any{"@type": "ReloadSettings"}}})
	return err
}
