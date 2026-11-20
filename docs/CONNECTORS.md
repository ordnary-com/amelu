# AI connectors (ChatGPT and other MCP clients)

A customer can give an AI assistant access to chosen mailboxes, whole domains
or everything in their organization, without sharing any mailbox password. The assistant connects to `https://api.amelu.org/mcp`
(Model Context Protocol, JSON-RPC over POST) and authenticates with OAuth.

## Flow

1. The client fetches `/.well-known/oauth-protected-resource` and
   `/.well-known/oauth-authorization-server`, then registers itself at
   `POST /oauth/register` (dynamic client registration, public client).
2. The client sends the customer to `{dashboard}/connect?client_id=...&redirect_uri=...&scope=...&state=...&code_challenge=...`
   (PKCE S256 only). The page lives in `beta/src/app/connect` and sits behind
   the normal dashboard login, so this is the one place to adapt when sign-in
   moves to ordnary-identity.
3. The customer switches on what the app can reach (everything, whole
   domains, single mailboxes) and the permissions. Approving calls
   `POST /api/oauth/connect` (session only), which returns the redirect back to
   the client with a one-time code (5 minutes).
4. `POST /oauth/token` swaps the code for an access token (1 hour,
   `amelu_mcp_...`) and a refresh token (`amelu_rt_...`, rotated on every use).

## Scopes

| Scope        | Tools                              |
| ------------ | ---------------------------------- |
| (any)        | `list_mailboxes`                   |
| `mail.read`  | `list_messages`, `get_message`     |
| `mail.draft` | `create_draft` (Drafts, not sent)  |
| `mail.send`  | `send_message`                     |

`mail.send` is never implied and is unticked on the consent page even when the
client asks for it.

## What a grant covers

A grant is a set of targets, stored on the token as `kind:id` (migration 0055):

- `org`: every mailbox of the organization, current and future.
- `domain`: every mailbox on that domain, including ones created later.
- `mailbox`: that one mailbox.

Targets are resolved against the live mailbox list on every call
(`handlers/connector_access.go`), so a deleted mailbox drops out and a new
mailbox on a granted domain is covered at once. Scopes apply to every target.
The mail tools take a `mailbox` address; it is optional when the grant
resolves to one mailbox and required otherwise (`list_mailboxes` lists them).

## Security model

- Connector tokens live in their own table (`connector_tokens`, migration 0054)
  and are only accepted by `/mcp`. `auth.Require` never sees them, and API keys
  are not accepted by `/mcp`.
- A token only reaches its targets, and only mailboxes of the granting
  customer's organization (an `org` target is matched against that
  organization id). Every tool call re-checks that the customer is still an
  owner or admin, and that the mailbox is active.
- Sends are capped at 20 per hour per connection (in memory, see
  `handlers/mcp.go`) on top of the normal Stalwart sending limits.
- Approval and revocation are session-only and written to the organization
  audit log (`connector.authorized`, `connector.revoked`). Customers disconnect
  under My Account > Connected Apps.
- Message bodies are third-party text; the tool descriptions tell the model to
  treat them as data.

## Configuration

`PUBLIC_API_URL` (default `http://localhost:8081`) is the externally reachable
API URL used in the discovery documents. The edge Worker sets it to
`https://api.amelu.org` in `cloudflare/edge/src/container.ts`. The consent page
is served from the first `CORS_ORIGIN` entry.

## Trying it locally

```
curl localhost:8081/.well-known/oauth-authorization-server
curl -X POST localhost:8081/mcp            # 401 with a WWW-Authenticate header
```

For a full run, register a client, open the `/connect` URL on the dashboard
(`pnpm dev:beta`, port 4200) and exchange the code at `/oauth/token`.
