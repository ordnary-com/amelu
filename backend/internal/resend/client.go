// Package resend wraps the minimal slice of Resend's HTTP API (POST
// /emails) Amelu needs for password-reset invite emails - nothing else.
package resend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type Client struct {
	apiKey    string
	fromEmail string
	fromName  string
	http      *http.Client
}

func NewClient(apiKey, fromEmail, fromName string) *Client {
	return &Client{
		apiKey:    apiKey,
		fromEmail: fromEmail,
		fromName:  fromName,
		http:      &http.Client{},
	}
}

type sendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
	Text    string   `json:"text"`
}

// SendEmail sends one email via Resend's API and returns its message ID on
// success.
func (c *Client) SendEmail(ctx context.Context, to, subject, html, text string) (string, error) {
	body, err := json.Marshal(sendRequest{
		From:    fmt.Sprintf("%s <%s>", c.fromName, c.fromEmail),
		To:      []string{to},
		Subject: subject,
		HTML:    html,
		Text:    text,
	})
	if err != nil {
		return "", fmt.Errorf("marshal send request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("send email: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		ID      string `json:"id"`
		Message string `json:"message"`
		Name    string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("resend returned %s: %s", resp.Status, result.Message)
	}
	return result.ID, nil
}
