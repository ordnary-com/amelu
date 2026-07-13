// Package stalwart wraps Stalwart Mail Server's admin/management API.
//
// Verified live against marduk.mx.amelu.org:8080 (its /api/schema endpoint
// serves the server's actual object/field schema — that's the source of
// truth used here, not the public docs, which turned out to be incomplete
// in a few places).
//
// The management API is JMAP-style method calls posted as a single JSON
// body to {baseURL}/jmap (NOT /api — a 404 trap; /api only serves a handful
// of REST-shaped endpoints like /api/schema and /api/auth) with the
// "urn:stalwart:jmap" capability, e.g.:
//
//	POST /jmap
//	{
//	  "using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
//	  "methodCalls": [["x:Domain/set", {"create": {"d0": {"name": "example.com"}}}, "c1"]]
//	}
//
// Confirmed against the live schema:
//   - HTTP Basic Auth works directly on /jmap, no separate token mint step.
//   - Domain object fields: name, aliases, isEnabled, dkimManagement,
//     dnsManagement, dnsZoneFile (serverSet, expected zone content),
//     catchAllAddress, reportAddressUri, createdAt. Methods: x:Domain/get,
//     x:Domain/set, x:Domain/query.
//   - Object ids are short opaque server-assigned tokens (e.g. "b"), never
//     the domain name/email itself — resolveDomainID's query-then-get
//     pattern is required, the name-as-id fallback never actually fires
//     against this server.
//   - ClusterNode fields: nodeId, hostname, lastRenewal, status
//     (active|stale|inactive). Method: x:ClusterNode/query, x:ClusterNode/get.
//   - Mailboxes are NOT "x:Principal" — that object exists but is for
//     sharing/ACLs. A mailbox is "x:Account" with type-variant "User"
//     (schema x:UserAccount), created via the view object x:Account/User.
//     Key fields: name (local part only, e.g. "alice" — NOT the full email),
//     domainId (an x:Domain object id, not a name), emailAddress (serverSet,
//     derived from name+domainId), credentials (an objectList of
//     type-variant x:Credential — the Password variant is x:PasswordCredential
//     with a "secret" field for the plaintext password), quotas, permissions.
//     This is a materially different shape than mailboxes.go currently
//     implements (which still assumes flat emails/secrets fields) — that
//     file needs a rewrite before mailbox creation will work.
//
// Still unconfirmed (not yet exercised against the live server):
//   - The exact JSON envelope for creating a multi-variant object via its
//     view (e.g. does "x:Account/User/set" work as a method name, or does
//     x:Account/set take a discriminator field?), and same question for
//     nested multi-variant fields like credentials[].
//   - Suspend semantics for a mailbox (permissions field shape wasn't
//     dumped from the schema yet).
package stalwart

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// ErrNotFound is returned (wrapped) when an object genuinely doesn't exist
// in Stalwart — as opposed to a network/auth/protocol error — so callers
// can tell "already gone" apart from "couldn't check."
var ErrNotFound = errors.New("not found in stalwart")

type Client struct {
	baseURL  string
	user     string
	password string
	http     *http.Client
}

func NewClient(baseURL, user, password string) *Client {
	return &Client{
		baseURL:  baseURL,
		user:     user,
		password: password,
		http:     &http.Client{},
	}
}

type methodCall struct {
	Name   string
	Args   any
	CallID string
}

type jmapRequest struct {
	Using       []string `json:"using"`
	MethodCalls []any    `json:"methodCalls"`
}

type jmapResponse struct {
	MethodResponses []json.RawMessage `json:"methodResponses"`
}

// call executes a single JMAP-style method call against /api and returns the
// raw arguments object of the response, or an error if the server returned a
// JMAP "error" method response.
func (c *Client) call(ctx context.Context, method string, args any) (json.RawMessage, error) {
	req := jmapRequest{
		// Every capability any method call() makes might need, all advertised
		// together - confirmed live that advertising a capability a given
		// call doesn't use is harmless, so there's no need for a second
		// call-with-capabilities variant.
		Using: []string{
			"urn:ietf:params:jmap:core",
			"urn:stalwart:jmap",
			"urn:ietf:params:jmap:sieve",
			"urn:ietf:params:jmap:mail",
			"urn:ietf:params:jmap:submission",
		},
		MethodCalls: []any{
			[]any{method, args, "c1"},
		},
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/jmap", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	httpReq.SetBasicAuth(c.user, c.password)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call stalwart: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errBody bytes.Buffer
		errBody.ReadFrom(resp.Body)
		return nil, fmt.Errorf("stalwart returned %s: %s", resp.Status, errBody.String())
	}

	var jresp jmapResponse
	if err := json.NewDecoder(resp.Body).Decode(&jresp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if len(jresp.MethodResponses) == 0 {
		return nil, fmt.Errorf("empty methodResponses from stalwart")
	}

	// Each method response is itself [name, args, callID].
	var tuple [3]json.RawMessage
	if err := json.Unmarshal(jresp.MethodResponses[0], &tuple); err != nil {
		return nil, fmt.Errorf("decode method response tuple: %w", err)
	}

	var respMethod string
	if err := json.Unmarshal(tuple[0], &respMethod); err != nil {
		return nil, fmt.Errorf("decode method response name: %w", err)
	}
	if respMethod == "error" {
		var jmapErr struct {
			Type        string `json:"type"`
			Description string `json:"description"`
		}
		json.Unmarshal(tuple[1], &jmapErr)
		return nil, fmt.Errorf("stalwart jmap error: %s: %s", jmapErr.Type, jmapErr.Description)
	}

	return tuple[1], nil
}
