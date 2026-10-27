// Package mailer sends Amelu's transactional email (password set-up/reset
// and organization invitations) through Cloudflare Email Sending.
//
// The Go origin runs in a Cloudflare Container and can't hold a Workers
// binding itself. It POSTs to MAIL_RELAY_URL instead, normally
// http://mail.internal/send: the edge Worker intercepts that hostname for the
// container (outboundByHost in cloudflare/edge/src/container.ts) and sends
// with its EMAIL send_email binding. The hostname only exists inside the
// container network, so the relay is never reachable from the internet.
package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	relayURL  string
	fromEmail string
	fromName  string
	http      *http.Client
}

func NewClient(relayURL, fromEmail, fromName string) *Client {
	return &Client{
		relayURL:  relayURL,
		fromEmail: fromEmail,
		fromName:  fromName,
		// Bounded, so a slow mail service can't hang the request it's part of.
		http: &http.Client{Timeout: 20 * time.Second},
	}
}

type sendRequest struct {
	FromEmail string `json:"fromEmail"`
	FromName  string `json:"fromName"`
	To        string `json:"to"`
	Subject   string `json:"subject"`
	HTML      string `json:"html"`
	Text      string `json:"text"`
}

// SendEmail sends one email and returns its message ID on success.
func (c *Client) SendEmail(ctx context.Context, to, subject, html, text string) (string, error) {
	body, err := json.Marshal(sendRequest{
		FromEmail: c.fromEmail,
		FromName:  c.fromName,
		To:        to,
		Subject:   subject,
		HTML:      html,
		Text:      text,
	})
	if err != nil {
		return "", fmt.Errorf("marshal send request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.relayURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("send email: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		ID    string `json:"id"`
		Code  string `json:"code"`
		Error string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response (%s): %w", resp.Status, err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("mail relay returned %s: %s %s", resp.Status, result.Code, result.Error)
	}
	return result.ID, nil
}
