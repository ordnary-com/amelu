# Amelu 2.0 dashboard (beta)

The rebuilt customer dashboard: Angular 22 (standalone, zoneless, signals)
with Tailwind v4, styled after ordnary-console. It talks to the same Go API
as `frontend/` and is meant to replace it page for page.

```
pnpm install
pnpm dev          # Go API on :8081 (and the current dashboard on :5173)
pnpm dev:beta     # this app on :4200, /api proxied to :8081
pnpm build:beta
```

Sign in through the current dashboard first: login (via Ordnary) still lives
there, and the session cookie it sets on localhost is what this app uses.

Layout of `src/app`:

- `shell/` top bar and the sidebar, with a menu column per level you're in
  (domain, then DNS, spam or a mailbox), as in the current dashboard.
- `api.ts` the shared API client and types; page groups that need more keep
  their own `*-api.ts` next to their pages.
- `ui.ts`, `status.ts`, `alert/`, `empty-state/`, `page-header/`, `icon.ts`
  the shared building blocks every page uses.
- One folder per page, or per group of pages under a domain (`mailboxes/`,
  `mailbox/`, `routing/`, `dns-spam/`, `domain-admin/`), each with its own
  lazily loaded `routes.ts`.
