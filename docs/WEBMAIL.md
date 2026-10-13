# Webmail (webmail.amelu.org)

A mail client for the people who *use* a mailbox, as opposed to the
dashboards, which are for the customer who *manages* domains and mailboxes.
They sign in with their full address and mailbox password, not with an
Ordnary ID.

## How it fits

- `webmail/` is an Angular app (same stack and look as `beta/`: standalone
  components, signals, Tailwind v4, Source Sans 3), served as static files
  from the Worker `amelu-webmail` on `webmail.amelu.org` with SPA fallback.
  `pnpm dev:webmail` serves it on :4300 and proxies `/api` to the Go API on
  :8081; `pnpm deploy:webmail` builds and uploads it.
- The Go API gains `/api/webmail/*` (`backend/internal/handlers/webmail_*.go`).
  Sign-in checks the password by opening a JMAP session on the mail cluster
  **as the user** (`GET /.well-known/jmap` with Basic auth): 200 means the
  password is right and gives the account id; 401 means it is wrong. After
  that every call goes to the cluster with the API's own admin credentials
  plus that account id, exactly like the dashboard's message endpoints do,
  so the user's password is never stored.
- The session is its own cookie, `amelu_webmail`, backed by the new
  `webmail_sessions` table (token hash, mailbox id, Stalwart account id,
  expiry). It is independent of the dashboard session: being signed in to
  one says nothing about the other.
- A mailbox must exist in Amelu's own database (status `active`) for its
  domain; the cluster alone is not enough. Suspended mailboxes get 403
  `MAILBOX_SUSPENDED`.
- `webmail.amelu.org` must be in `CORS_ORIGIN` (container) and
  `ALLOWED_ORIGIN` (edge Worker secret), after `app` and `beta`.

Errors use the API's standard body `{error, code, status, requestId}` (see
`handlers/json.go`); a 401 with code `UNAUTHORIZED` means "sign in again".

## API

All paths below are under `/api/webmail`. All need the cookie except
`login`. Ids are the cluster's JMAP ids and are opaque strings.

### Session

| Call | Body | Response |
| --- | --- | --- |
| `POST /login` | `{email, password}` | `200 {account}`; `401 INVALID_CREDENTIALS`; `403 MAILBOX_SUSPENDED`; `404 MAILBOX_NOT_FOUND` (no such mailbox in Amelu) |
| `POST /logout` | | `204` |
| `GET /me` | | `{account}` |

`account`: `{email, displayName, domain, quota: {usedBytes, maxBytes} | null}`.

### Folders

JMAP Mailbox objects. `role` is one of `inbox sent drafts trash junk
archive` or absent for a user folder.

| Call | Body | Response |
| --- | --- | --- |
| `GET /folders` | | `{folders: [folder]}` |
| `POST /folders` | `{name, parentId?}` | `201 folder` |
| `PATCH /folders/{id}` | `{name?, parentId?}` (`parentId: null` moves to top level) | `folder` |
| `DELETE /folders/{id}` | | `204`; its mail goes to Trash. System folders: `403 FOLDER_PROTECTED` |

`folder`: `{id, name, role?, parentId?, unread, total, sortOrder}`.

### Messages

| Call | Query / body | Response |
| --- | --- | --- |
| `GET /messages` | `folder` (id, required unless `q`), `position` (0), `limit` (50, max 100), `q` (free text; without `folder` searches everything), `unread=1`, `flagged=1` | `{messages: [summary], total, position}`; newest first |
| `GET /messages/{id}` | | `message` |
| `GET /messages/{id}/raw` | | the original `message/rfc822`, as a download |
| `POST /messages/flags` | `{ids, seen?: bool, flagged?: bool}` (omitted = unchanged) | `204` |
| `POST /messages/move` | `{ids, folderId}` | `204` |
| `POST /messages/delete` | `{ids}` | `204`; moves to Trash, or destroys messages already in Trash |
| `POST /messages/spam` | `{ids, spam: bool}` | `204`; moves to Junk, or back to Inbox |

`summary`: `{id, threadId, subject, from: [addr], to: [addr], receivedAt,
preview, hasAttachments, seen, flagged, answered, forwarded, draft, size,
folderIds: [id]}`. `addr` is `{name?, email}`.

`message` is a `summary` plus `{cc: [addr], bcc: [addr], replyTo: [addr],
messageId: [string], inReplyTo: [string], references: [string], sentAt,
textBody, htmlBody, attachments: [attachment]}`. Bodies are decoded; the
HTML is **not** sanitized by the API, the client must sanitize before
rendering. `attachment`: `{blobId, name, type, size, cid?, inline}`.

### Blobs

| Call | Body | Response |
| --- | --- | --- |
| `GET /blobs/{blobId}?name=&type=` | | the bytes, `Content-Disposition: attachment` unless `inline=1` (images only) |
| `POST /blobs` | raw bytes, with `Content-Type`; `X-File-Name` header for the name | `201 {blobId, name, type, size}`; max 25 MB (`413 BLOB_TOO_LARGE`) |

### Drafts and sending

`draft`: `{to: [addr], cc: [addr], bcc: [addr], subject, text, html?,
attachments: [{blobId, name, type, size}], inReplyTo?: string (a
Message-ID), references?: [string], replyToId?: id (the message being
answered, so it gets `$answered`), forwardOfId?: id (gets `$forwarded`)}`.

JMAP messages are immutable, so saving a draft again creates a new one and
removes the old one; the response always carries the current id.

| Call | Body | Response |
| --- | --- | --- |
| `POST /drafts` | `draft` | `201 {id}` |
| `PUT /drafts/{id}` | `draft` | `{id}` (new id) |
| `DELETE /drafts/{id}` | | `204` |
| `POST /send` | `{draft, draftId?}` | `200 {id}`; the sent message is in Sent, the draft (if any) is gone. `400 NO_RECIPIENTS`; `502 MAIL_CLUSTER_REJECTED` with the cluster's reason |

The API sets `From` to the signed-in address; the client never sends it.
When `html` is absent the API sends plain text only.

### Settings

| Call | Body | Response |
| --- | --- | --- |
| `GET /settings` | | `{identity: {name, textSignature, htmlSignature}, vacation: {enabled, subject, text, from?, to?}}` (`from`/`to` are ISO dates or absent) |
| `PUT /settings/identity` | `{name, textSignature}` | `204` |
| `PUT /settings/vacation` | `{enabled, subject, text, from?, to?}` | `204` |
| `POST /settings/password` | `{current, new}` | `204`; `401 INVALID_CREDENTIALS` when `current` is wrong; `400 PASSWORD_TOO_SHORT` under 8 characters. Other sessions of the mailbox stay valid. |

## Client

Routes: `/login`; `/` redirects to the Inbox; `/folder/:folderId`;
`/folder/:folderId/:messageId`; `/compose` (query `draft=<id>` to resume a
draft, `reply=<id>`, `replyAll=<id>` or `forward=<id>`); `/settings`,
`/settings/vacation`, `/settings/password`.

Three panes on desktop (folders, list, message), one pane at a time on a
phone. The message HTML is sanitized with DOMPurify and rendered in a
sandboxed iframe (`sandbox` without `allow-scripts`); remote images are
blocked until the person clicks "Show images". Links open in a new tab.
