# Amelu HTTP API

Base URL: `https://api.amelu.org` (locally `http://localhost:8081`).

Everything under `/api` is JSON in, JSON out. Errors are
`{"error": "human readable message"}` with a matching status code.

## Authentication

Two ways in, and which one you get decides what you can reach.

**Session cookie** - what the dashboard uses. Set by `POST /api/login` or the
Ordnary SSO callback.

**API key** - what a script or agent uses. Create one under My Account ->
API Keys, then send it as a bearer token:

```
Authorization: Bearer amelu_live_XXXXXXXX...
```

A key acts as the customer who created it, with that customer's organization
role. The raw key is shown once at creation and never stored, so it cannot be
recovered - only replaced.

Keys deliberately cannot reach `/api/account/*` or `/api/account/api-keys`.
Those are cookie-only, so a leaked key cannot mint more keys, change the
sign-in email, or delete the account.

Keys are for server-to-server callers. CORS only allows `Content-Type`, so a
key cannot be used from browser JavaScript on the dashboard origin - putting
one in a frontend bundle would leak it anyway.

## Mail

These are the endpoints an automated caller wants: read and send as a
mailbox over HTTP, instead of speaking IMAP and SMTP.

Owner and admin only. Helpdesk can reset a mailbox password but cannot read
its mail; read_only can view configuration but not correspondence.

### List messages

```
GET /api/mailboxes/{id}/messages?folder=inbox&limit=25&position=0
```

`folder` is `inbox` (default) or `sent`. `limit` is 1-100, default 25.
`position` is a zero-based offset - pass back `position + len(messages)` for
the next page, and stop when it reaches `total`.

```json
{
  "messages": [
    {
      "id": "a1b2",
      "threadId": "t1",
      "subject": "Your invoice",
      "from": [{ "name": "Billing", "email": "billing@vendor.com" }],
      "to": [{ "email": "agent@yourdomain.com" }],
      "receivedAt": "2026-07-30T10:00:00Z",
      "preview": "Attached is invoice 4417 for...",
      "hasAttachments": true,
      "seen": false
    }
  ],
  "total": 137,
  "position": 0
}
```

### Get one message

```
GET /api/mailboxes/{id}/messages/{messageId}
```

Same fields plus `cc`, `replyTo`, `messageId`, `inReplyTo`, `textBody`,
`htmlBody`, and `attachments` (name, type, size). Bodies are decoded for you
and capped at 256 KB each. Attachment bytes are not downloadable yet, only
listed.

### Send

```
POST /api/mailboxes/{id}/messages
{
  "to": ["someone@example.com"],
  "cc": [],
  "subject": "Weekly report",
  "textBody": "plain text",
  "htmlBody": "<p>optional</p>"
}
```

There is no `from` field. A message always goes out as the mailbox it was
submitted through, so a key can never send as a colleague's address. At least
one of `textBody` or `htmlBody` is required, up to 50 recipients across
`to` and `cc`, and sending fails with 403 if the mailbox has sending
disabled.

Returns `201` with `{"id": "..."}`, the id of the sent message, which is
filed in Sent and readable back via `?folder=sent`.

## What is not here yet

- **Inbound webhooks.** There is no push on new mail; poll the inbox. This is
  the most requested missing piece for agent use.
- **Attachment download.** Attachments are listed, not fetchable.
- **Folders beyond inbox and sent**, and marking messages read or deleted.
