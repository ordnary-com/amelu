# Amelu dashboard

The customer dashboard: Angular 22 (standalone, zoneless, signals) with
Tailwind v4, styled after ordnary-console. It talks to the Go API in
`backend/`.

```
pnpm install
pnpm dev          # Go API on :8081 and this app on :4200, /api proxied to :8081
pnpm build
pnpm deploy       # build, then upload to the amelu-beta Worker (app.amelu.org)
```

Signing in happens on this app's own /login page (via Ordnary). The API
must list this app's origin in `CORS_ORIGIN` (`http://localhost:4200`
locally) so the Ordnary callback sends you back here.

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
