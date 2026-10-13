package stalwart

import (
	"context"
	"errors"
)

// DomainExists says whether the cluster knows the domain at all.
func (c *Client) DomainExists(ctx context.Context, name string) (bool, error) {
	_, err := c.resolveDomainID(ctx, name)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	return err == nil, err
}

// MailboxExists says whether the account exists in the cluster. A missing
// domain counts as a missing mailbox.
func (c *Client) MailboxExists(ctx context.Context, localPart, domainName string) (bool, error) {
	_, err := c.resolveAccountID(ctx, localPart, domainName)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	return err == nil, err
}
