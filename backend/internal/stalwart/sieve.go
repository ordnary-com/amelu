package stalwart

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// uploadBlob stores content as a blob under accountId and returns its
// blobId. Confirmed live: the upload endpoint is a plain POST of the raw
// bytes (not a JMAP method call) to {baseURL}/jmap/upload/{accountId}/.
func (c *Client) uploadBlob(ctx context.Context, accountID string, content []byte) (string, error) {
	url := fmt.Sprintf("%s/jmap/upload/%s/", c.baseURL, accountID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(content))
	if err != nil {
		return "", fmt.Errorf("build upload request: %w", err)
	}
	httpReq.SetBasicAuth(c.user, c.password)
	httpReq.Header.Set("Content-Type", "application/sieve")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("upload blob: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errBody bytes.Buffer
		errBody.ReadFrom(resp.Body)
		return "", fmt.Errorf("stalwart upload returned %s: %s", resp.Status, errBody.String())
	}

	var result struct {
		BlobID string `json:"blobId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode upload response: %w", err)
	}
	return result.BlobID, nil
}

type sieveScript struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	BlobID   string `json:"blobId"`
	IsActive bool   `json:"isActive"`
}

// findSieveScriptByName looks up an existing script by name on the given
// account. There's no server-side filter for this (SieveScript/query only
// supports listing everything), so this lists all scripts and matches
// client-side - fine given an account only ever holds a handful of Amelu
// managed scripts.
func (c *Client) findSieveScriptByName(ctx context.Context, accountID, name string) (*sieveScript, error) {
	raw, err := c.call(ctx, "SieveScript/get", map[string]any{
		"accountId": accountID,
		"ids":       nil,
	})
	if err != nil {
		return nil, fmt.Errorf("list sieve scripts: %w", err)
	}
	var result struct {
		List []sieveScript `json:"list"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode sieve script list: %w", err)
	}
	for i := range result.List {
		if result.List[i].Name == name {
			return &result.List[i], nil
		}
	}
	return nil, nil
}

// DeploySieveScript installs content as the active Sieve script named name
// on localPart@domainName's account, replacing any previous content under
// that same name. Confirmed live: updating an existing script's blobId in
// place keeps it active - no separate re-activation step needed on update,
// only on first creation.
func (c *Client) DeploySieveScript(ctx context.Context, localPart, domainName, name string, content []byte) error {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return fmt.Errorf("resolve account for sieve script %s: %w", name, err)
	}

	blobID, err := c.uploadBlob(ctx, accountID, content)
	if err != nil {
		return fmt.Errorf("upload sieve script %s for %s@%s: %w", name, localPart, domainName, err)
	}

	existing, err := c.findSieveScriptByName(ctx, accountID, name)
	if err != nil {
		return err
	}

	if existing != nil {
		raw, err := c.call(ctx, "SieveScript/set", map[string]any{
			"accountId": accountID,
			"update": map[string]any{
				existing.ID: map[string]any{"blobId": blobID},
			},
		})
		if err != nil {
			return fmt.Errorf("update sieve script %s for %s@%s: %w", name, localPart, domainName, err)
		}
		return checkSieveNotUpdated(raw, existing.ID, name, localPart, domainName)
	}

	raw, err := c.call(ctx, "SieveScript/set", map[string]any{
		"accountId": accountID,
		"create": map[string]any{
			"s0": map[string]any{"name": name, "blobId": blobID},
		},
	})
	if err != nil {
		return fmt.Errorf("create sieve script %s for %s@%s: %w", name, localPart, domainName, err)
	}
	var created struct {
		Created    map[string]json.RawMessage `json:"created"`
		NotCreated map[string]json.RawMessage `json:"notCreated"`
	}
	if err := json.Unmarshal(raw, &created); err != nil {
		return fmt.Errorf("decode create sieve script response: %w", err)
	}
	if reason, ok := created.NotCreated["s0"]; ok {
		return fmt.Errorf("stalwart refused sieve script %s for %s@%s: %s", name, localPart, domainName, reason)
	}
	var newScript struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(created.Created["s0"], &newScript); err != nil {
		return fmt.Errorf("decode created sieve script: %w", err)
	}

	raw, err = c.call(ctx, "SieveScript/set", map[string]any{
		"accountId": accountID,
		"update": map[string]any{
			newScript.ID: map[string]any{"isActive": true},
		},
	})
	if err != nil {
		return fmt.Errorf("activate sieve script %s for %s@%s: %w", name, localPart, domainName, err)
	}
	return checkSieveNotUpdated(raw, newScript.ID, name, localPart, domainName)
}

// RemoveSieveScript deactivates and destroys the script named name on
// localPart@domainName's account, if it exists. A missing script is not an
// error - removing the last rule of a kind leaves nothing to clean up.
func (c *Client) RemoveSieveScript(ctx context.Context, localPart, domainName, name string) error {
	accountID, err := c.resolveAccountID(ctx, localPart, domainName)
	if err != nil {
		return fmt.Errorf("resolve account for sieve script %s: %w", name, err)
	}
	existing, err := c.findSieveScriptByName(ctx, accountID, name)
	if err != nil {
		return err
	}
	if existing == nil {
		return nil
	}

	if existing.IsActive {
		raw, err := c.call(ctx, "SieveScript/set", map[string]any{
			"accountId": accountID,
			"update": map[string]any{
				existing.ID: map[string]any{"isActive": false},
			},
		})
		if err != nil {
			return fmt.Errorf("deactivate sieve script %s for %s@%s: %w", name, localPart, domainName, err)
		}
		if err := checkSieveNotUpdated(raw, existing.ID, name, localPart, domainName); err != nil {
			return err
		}
	}

	raw, err := c.call(ctx, "SieveScript/set", map[string]any{
		"accountId": accountID,
		"destroy":   []string{existing.ID},
	})
	if err != nil {
		return fmt.Errorf("remove sieve script %s for %s@%s: %w", name, localPart, domainName, err)
	}
	var result struct {
		NotDestroyed map[string]json.RawMessage `json:"notDestroyed"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode remove sieve script response: %w", err)
	}
	if reason, ok := result.NotDestroyed[existing.ID]; ok {
		return fmt.Errorf("stalwart refused to remove sieve script %s for %s@%s: %s", name, localPart, domainName, reason)
	}
	return nil
}

func checkSieveNotUpdated(raw json.RawMessage, id, scriptName, localPart, domainName string) error {
	var result struct {
		NotUpdated map[string]json.RawMessage `json:"notUpdated"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode sieve script update response: %w", err)
	}
	if reason, ok := result.NotUpdated[id]; ok {
		return fmt.Errorf("stalwart refused sieve script %s for %s@%s: %s", scriptName, localPart, domainName, reason)
	}
	return nil
}
