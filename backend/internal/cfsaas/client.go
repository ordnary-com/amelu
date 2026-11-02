// Package cfsaas puts an organization's own webmail hostname on Cloudflare:
// a custom hostname (Cloudflare for SaaS) on the amelu.org zone, so
// Cloudflare issues its certificate, and a Worker route for it, so the
// webmail Worker answers there. See docs/WEBMAIL.md.
package cfsaas

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	token  string
	zoneID string
	worker string
	http   *http.Client
	base   string
}

func NewClient(token, zoneID, worker string) *Client {
	return &Client{token: token, zoneID: zoneID, worker: worker, http: &http.Client{Timeout: 20 * time.Second}, base: "https://api.cloudflare.com/client/v4"}
}

// Hostname is a custom hostname as Cloudflare reports it. Status is
// pending, active or failed, folded from Cloudflare's hostname and
// certificate states.
type Hostname struct {
	ID     string
	Status string
	Error  string
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

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var env envelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return fmt.Errorf("cloudflare %s %s: %d", method, path, resp.StatusCode)
	}
	if !env.Success {
		msgs := make([]string, 0, len(env.Errors))
		for _, e := range env.Errors {
			msgs = append(msgs, fmt.Sprintf("%d %s", e.Code, e.Message))
		}
		return fmt.Errorf("cloudflare %s %s: %s", method, path, strings.Join(msgs, "; "))
	}
	if out != nil {
		return json.Unmarshal(env.Result, out)
	}
	return nil
}

type hostnameResult struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	SSL    struct {
		Status           string `json:"status"`
		ValidationErrors []struct {
			Message string `json:"message"`
		} `json:"validation_errors"`
	} `json:"ssl"`
	VerificationErrors []string `json:"verification_errors"`
}

func (h hostnameResult) fold() Hostname {
	out := Hostname{ID: h.ID, Status: "pending"}
	switch {
	case h.Status == "active" && h.SSL.Status == "active":
		out.Status = "active"
	case strings.Contains(h.Status, "blocked") || strings.Contains(h.Status, "deleted") || h.SSL.Status == "validation_timed_out" || h.SSL.Status == "expired":
		out.Status = "failed"
	}
	switch {
	case len(h.VerificationErrors) > 0:
		out.Error = h.VerificationErrors[0]
	case len(h.SSL.ValidationErrors) > 0:
		out.Error = h.SSL.ValidationErrors[0].Message
	}
	return out
}

// CreateHostname registers hostname with a DV certificate validated over
// HTTP, which Cloudflare completes by itself once the customer's CNAME
// points at us.
func (c *Client) CreateHostname(ctx context.Context, hostname string) (Hostname, error) {
	var res hostnameResult
	err := c.do(ctx, http.MethodPost, "/zones/"+c.zoneID+"/custom_hostnames", map[string]any{
		"hostname": hostname,
		"ssl": map[string]any{
			"method": "http", "type": "dv",
			"settings": map[string]any{"min_tls_version": "1.2"},
		},
	}, &res)
	return res.fold(), err
}

func (c *Client) GetHostname(ctx context.Context, id string) (Hostname, error) {
	var res hostnameResult
	err := c.do(ctx, http.MethodGet, "/zones/"+c.zoneID+"/custom_hostnames/"+id, nil, &res)
	return res.fold(), err
}

func (c *Client) DeleteHostname(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/zones/"+c.zoneID+"/custom_hostnames/"+id, nil, nil)
}

// CreateRoute sends hostname/* to the webmail Worker.
func (c *Client) CreateRoute(ctx context.Context, hostname string) (string, error) {
	var res struct {
		ID string `json:"id"`
	}
	err := c.do(ctx, http.MethodPost, "/zones/"+c.zoneID+"/workers/routes", map[string]any{
		"pattern": hostname + "/*", "script": c.worker,
	}, &res)
	return res.ID, err
}

func (c *Client) DeleteRoute(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/zones/"+c.zoneID+"/workers/routes/"+id, nil, nil)
}
