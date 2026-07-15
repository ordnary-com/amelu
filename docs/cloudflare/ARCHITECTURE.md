# Architecture

Last verified against Cloudflare documentation: 2026-07-15.

## Target picture

```mermaid
flowchart LR
    subgraph Client
        Browser["Customer browser"]
        MailClient["Mail client (SMTP/IMAP/POP3)"]
    end

    subgraph Cloudflare
        Pages["Cloudflare Pages\napp.amelu.org\n(React dashboard)"]
        WAF["Cloudflare WAF / DNS proxy"]
        Worker["Edge Worker\napi.amelu.org\ncloudflare/edge"]
        Tunnel["Cloudflare Tunnel\n(cloudflared)"]
        Queues["Cloudflare Queues"]
        Workflows["Cloudflare Workflows"]
        R2["R2 (EU jurisdiction)\nexports/reports only"]
    end

    subgraph "Origin (unchanged infra)"
        GoAPI["Go API\n(private, no public port)"]
        PG[("PostgreSQL")]
        Stalwart["Stalwart mail server\n(admin API private)"]
    end

    subgraph "Mail traffic - never through Cloudflare HTTP proxy"
        MX["DNS-only MX / A records"]
    end

    Browser --> Pages
    Browser --> WAF --> Worker --> Tunnel --> GoAPI
    GoAPI --> PG
    GoAPI --> Stalwart
    GoAPI -. mints signed URLs .-> R2
    MailClient --> MX --> Stalwart
```

## Request flow (customer dashboard action)

```mermaid
sequenceDiagram
    participant B as Browser (app.amelu.org)
    participant W as Edge Worker (api.amelu.org)
    participant T as Cloudflare Tunnel
    participant G as Go API (private)

    B->>W: HTTPS + session cookie
    W->>W: CORS check, security headers, request id
    W->>T: signed request (X-Origin-Shared-Secret)
    T->>G: forwarded over private hostname, no public port
    G->>G: auth.Require (session), handler logic
    G-->>T: JSON response
    T-->>W: JSON response
    W-->>B: JSON response (no-store, security headers)
```

## Async job flow (domain verification example)

```mermaid
sequenceDiagram
    participant G as Go API
    participant Q as Cloudflare Queue
    participant C as Queue Consumer Worker
    participant DoH as Cloudflare DNS-over-HTTPS
    participant G2 as Go API (internal endpoint)

    G->>Q: enqueue verification message (idempotency key)
    Q->>C: at-least-once delivery
    C->>DoH: TXT lookup
    alt verified
        C->>G2: POST /internal/jobs/domain-verified (HMAC signed)
        G2-->>C: 200 OK
        C->>Q: ack
    else not yet verified
        C->>Q: retry (exponential backoff)
    end
    Q->>Q: after max_retries, route to DLQ
```

## Mail traffic (unaffected by this migration)

```mermaid
flowchart LR
    MailClient["Mail client"] -->|"SMTP/IMAP/POP3/ManageSieve"| DNS["DNS-only records\n(mail.*, mx1-3.*)"]
    DNS --> Stalwart["Stalwart mail server"]
    Stalwart --> MailStorage[("Stalwart's own disk\n- unchanged")]
```

No Cloudflare product sits between a mail client and Stalwart. See
`DNS_AND_MAIL.md` for exactly which records are DNS-only vs. proxied.

## Components and where they run after this migration

| Component | Before | After |
|---|---|---|
| React dashboard | served by Vite/whatever static host | Cloudflare Pages |
| Go API | public HTTP listener | private, behind Cloudflare Tunnel, fronted by an edge Worker |
| Postgres | wherever it runs today | unchanged |
| Stalwart mail server | public mail protocols, private admin API | unchanged - admin API stays private |
| Mailbox expiration ticker | in-process Go goroutine | in-process by default; optional Worker Cron Trigger + Workflow via feature flag |
| Domain verification | synchronous live DNS check in a request handler | existing synchronous check unchanged; new async Queue-based path scaffolded for future adoption |
| Stalwart provisioning | synchronous in `CreateDomain` handler | unchanged; async Workflow designed, not adopted yet |
| CSV exports / reports / support bundles | not object-stored today | new: optional private R2 storage with signed URLs (see `R2_STORAGE.md`) |

## Why this shape

- **Worker in front of Go, not a rewrite**: the Go backend's routing,
  handlers, and Postgres access are untouched. The Worker's job is
  edge-level concerns (CORS, headers, health, request id) that don't belong
  in application code duplicated per-language.
- **Tunnel instead of a public port**: removes the Go API's public attack
  surface entirely - `cloudflared` makes an outbound-only connection, so
  there's no listener to firewall or patch against internet scanning.
- **Queues/Workflows are additive, not required**: today's in-process ticker
  and synchronous provisioning keep working unmodified; the async paths are
  feature-flagged or simply not wired into the request path yet, so nothing
  about migrating to Cloudflare requires touching that behavior on day one.
- **R2 for exports only, not mail**: mailbox storage is Stalwart's domain
  expertise (retention, IMAP semantics, etc.) - re-implementing that on R2
  would be a rewrite of the mail server, not a migration.

## References

- Workers: https://developers.cloudflare.com/workers/
- Pages: https://developers.cloudflare.com/pages/
- Queues: https://developers.cloudflare.com/queues/
- Workflows: https://developers.cloudflare.com/workflows/
- R2: https://developers.cloudflare.com/r2/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- WAF: https://developers.cloudflare.com/waf/
- DNS: https://developers.cloudflare.com/dns/
