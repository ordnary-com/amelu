// Package cfdns hosts customer zones for "Amelu nameservers": each domain
// becomes a Cloudflare zone in the Ordnary account, switched to the
// account's custom nameserver set (ns1/ns2.amelu.org), so the customer
// points their registrar at Amelu and every mail record is set for them.
// See docs/AMELU_NAMESERVERS.md.
package cfdns

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrNotFound is returned when Cloudflare no longer knows a zone or record.
var ErrNotFound = errors.New("not found")

type Client struct {
	token       string
	accountID   string
	nsSet       int
	nameservers []string
	http        *http.Client
	base        string
}

// NewClient needs a token that may create zones and edit their DNS in the
// account, plus the account's custom nameserver set to put new zones on.
func NewClient(token, accountID string, nsSet int, nameservers []string) *Client {
	return &Client{
		token:       token,
		accountID:   accountID,
		nsSet:       nsSet,
		nameservers: nameservers,
		http:        &http.Client{Timeout: 30 * time.Second},
		base:        "https://api.cloudflare.com/client/v4",
	}
}

// Nameservers are the names customers point their domain at, or nil when
// each zone keeps the pair Cloudflare assigns it (nsSet 0, until account
// custom nameservers are enabled on the account).
func (c *Client) Nameservers() []string {
	if c.nsSet == 0 {
		return nil
	}
	return append([]string(nil), c.nameservers...)
}

// ZoneNameservers are the names a new zone answers on.
func (c *Client) ZoneNameservers(z *Zone) []string {
	if c.nsSet == 0 {
		return append([]string(nil), z.NameServers...)
	}
	return c.Nameservers()
}

type envelope struct {
	Success bool            `json:"success"`
	Errors  []apiError      `json:"errors"`
	Result  json.RawMessage `json:"result"`
}

type apiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Error is a Cloudflare API error, kept whole so callers can tell an
// existing zone (1061) from other failures.
type Error struct {
	Status int
	Codes  []int
	Msg    string
}

func (e *Error) Error() string { return fmt.Sprintf("cloudflare %d: %s", e.Status, e.Msg) }

func (e *Error) Has(code int) bool {
	for _, c := range e.Codes {
		if c == code {
			return true
		}
	}
	return false
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var r io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return err
		}
		r = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, r)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return fmt.Errorf("cloudflare %d: unreadable response", resp.StatusCode)
	}
	if !env.Success {
		e := &Error{Status: resp.StatusCode}
		var msgs []string
		for _, ae := range env.Errors {
			e.Codes = append(e.Codes, ae.Code)
			msgs = append(msgs, ae.Message)
		}
		e.Msg = strings.Join(msgs, "; ")
		return e
	}
	if out != nil && len(env.Result) > 0 {
		return json.Unmarshal(env.Result, out)
	}
	return nil
}

// Zone is the part of a Cloudflare zone Amelu cares about. Status is
// "pending" until the registrar delegates to the nameservers, then "active".
type Zone struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Status      string   `json:"status"`
	NameServers []string `json:"name_servers"`
}

// CreateZone adds the domain as a full zone on the Amelu nameserver set.
func (c *Client) CreateZone(ctx context.Context, domain string) (*Zone, error) {
	var z Zone
	err := c.do(ctx, http.MethodPost, "/zones", map[string]any{
		"name":    domain,
		"account": map[string]string{"id": c.accountID},
		"type":    "full",
	}, &z)
	if err != nil {
		return nil, err
	}
	if c.nsSet == 0 {
		return &z, nil
	}
	if err := c.useCustomNameservers(ctx, z.ID); err != nil {
		// A zone on Cloudflare's own nameservers would tell the customer the
		// wrong names, so it doesn't stay.
		_ = c.DeleteZone(ctx, z.ID)
		return nil, fmt.Errorf("switch %s to the Amelu nameservers: %w", domain, err)
	}
	return &z, nil
}

func (c *Client) useCustomNameservers(ctx context.Context, zoneID string) error {
	return c.do(ctx, http.MethodPatch, "/zones/"+zoneID+"/dns_settings", map[string]any{
		"nameservers": map[string]any{"type": "custom.account", "ns_set": c.nsSet},
	}, nil)
}

func (c *Client) GetZone(ctx context.Context, zoneID string) (*Zone, error) {
	var z Zone
	if err := c.do(ctx, http.MethodGet, "/zones/"+zoneID, nil, &z); err != nil {
		return nil, err
	}
	return &z, nil
}

// CheckActivation asks Cloudflare to look at the delegation again now,
// instead of waiting for its own schedule. Cloudflare rate-limits this, so
// an error is not worth reporting.
func (c *Client) CheckActivation(ctx context.Context, zoneID string) {
	_ = c.do(ctx, http.MethodPut, "/zones/"+zoneID+"/activation_check", nil, nil)
}

func (c *Client) DeleteZone(ctx context.Context, zoneID string) error {
	err := c.do(ctx, http.MethodDelete, "/zones/"+zoneID, nil, nil)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	return err
}

// ImportExisting copies the records the domain's current DNS answers with
// into the zone, so the website keeps working once the nameservers move.
// Cloudflare's scan only finds common names; anything else the customer
// adds in the editor.
func (c *Client) ImportExisting(ctx context.Context, zoneID string) error {
	return c.do(ctx, http.MethodPost, "/zones/"+zoneID+"/dns_records/scan", nil, nil)
}

// Record is one DNS record. Name is the full name ("www.example.com").
// Priority is set for MX; SRV uses Data.
type Record struct {
	ID       string         `json:"id,omitempty"`
	Type     string         `json:"type"`
	Name     string         `json:"name"`
	Content  string         `json:"content,omitempty"`
	TTL      int            `json:"ttl"`
	Priority *int           `json:"priority,omitempty"`
	Proxied  *bool          `json:"proxied,omitempty"`
	Data     map[string]any `json:"data,omitempty"`
	Comment  string         `json:"comment,omitempty"`
}

func (c *Client) ListRecords(ctx context.Context, zoneID string) ([]Record, error) {
	var all []Record
	for page := 1; ; page++ {
		var batch []Record
		q := url.Values{"per_page": {"500"}, "page": {fmt.Sprint(page)}}
		if err := c.do(ctx, http.MethodGet, "/zones/"+zoneID+"/dns_records?"+q.Encode(), nil, &batch); err != nil {
			return nil, err
		}
		all = append(all, batch...)
		if len(batch) < 500 {
			return all, nil
		}
	}
}

func (c *Client) CreateRecord(ctx context.Context, zoneID string, rec Record) (*Record, error) {
	var out Record
	if err := c.do(ctx, http.MethodPost, "/zones/"+zoneID+"/dns_records", rec, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) UpdateRecord(ctx context.Context, zoneID, recordID string, rec Record) (*Record, error) {
	var out Record
	rec.ID = ""
	if err := c.do(ctx, http.MethodPut, "/zones/"+zoneID+"/dns_records/"+recordID, rec, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) DeleteRecord(ctx context.Context, zoneID, recordID string) error {
	err := c.do(ctx, http.MethodDelete, "/zones/"+zoneID+"/dns_records/"+recordID, nil, nil)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	return err
}
