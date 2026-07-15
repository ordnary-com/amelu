# Cloudflare Pages: Frontend

Last verified against Cloudflare documentation: 2026-07-15.

## What's already in place

- `frontend/src/api/client.ts` reads the API base URL from
  `import.meta.env.VITE_API_URL` (falls back to `http://localhost:8081` for
  local dev) - no secrets, no hardcoded production URL, in the bundled JS.
- `frontend/public/_redirects` (`/* /index.html 200`) - SPA fallback so
  client-side routes (react-router v7) resolve correctly instead of 404ing
  on a Pages-served asset host.
- `frontend/vite.config.ts` has no environment-dependent plugin
  configuration - the same build command produces the same output shape in
  every environment (deterministic build), only `VITE_API_URL` varies.

## Exact GitHub connection steps

1. Complete `DASHBOARD_SETUP.md` step 5 first (create the Pages project,
   connect to Git).
2. Production branch: `main`. Preview branches: all others (Pages' default -
   every PR gets its own preview URL automatically).
3. Build settings:
   - **Framework preset**: None (Vite isn't in Pages' preset list in a way
     that matches this monorepo layout - configure manually).
   - **Build command**: `cd frontend && npx tsc -b && npx vite build` (the
     same steps as `frontend/package.json`'s `build` script; run explicitly
     rather than `pnpm build` at the repo root, since Pages' build
     environment builds only this project, not the pnpm workspace).
   - **Build output directory**: `frontend/dist`
   - **Root directory**: `/` (repo root - needed so the build command's `cd
     frontend` works and so pnpm workspace files are visible if you switch
     to `pnpm install && pnpm --filter frontend build` instead).
   - **Node version**: 20 (matches `.nvmrc`) - set via the `NODE_VERSION`
     environment variable in Pages' build settings, since Pages doesn't read
     `.nvmrc` automatically.

Reference: https://developers.cloudflare.com/pages/configuration/build-configuration/

## Environment variables

Set per Pages environment (Production vs. Preview), not in this repo:

| Variable | Production | Preview |
|---|---|---|
| `VITE_API_URL` | `https://api.amelu.org` | the PR's edge Worker preview URL, or `https://api.amelu.org` if previews share the same API |
| `NODE_VERSION` | `20` | `20` |

Set these in Pages -> your project -> Settings -> Environment variables.
`VITE_API_URL` is read at **build time** by Vite (`import.meta.env`), not at
runtime - a preview deploy pointed at the wrong API URL needs a rebuild, not
a config toggle.

## Custom domain: app.amelu.org

Pages -> your project -> Custom domains -> Add `app.amelu.org`. This
automatically creates a proxied CNAME record - see `DNS_AND_MAIL.md` for how
that interacts with the rest of the zone's DNS. Do this as part of the
`DNS_AND_MAIL.md` cutover, not before.

Reference: https://developers.cloudflare.com/pages/configuration/custom-domains/

## Preview deployments

Every PR against `main` gets an automatic preview URL
(`<hash>.amelu-frontend.pages.dev`) once the Pages project is connected -
no extra configuration needed beyond the GitHub connection itself. The
`.github/workflows/frontend.yml` CI job builds and tests the frontend
independently of Pages' own build, so a broken build fails CI before Pages
even attempts to deploy it.

## Local verification before relying on Pages

```
cd frontend
VITE_API_URL=https://api.amelu.org npx vite build
```

This is the actual build Pages runs (minus `tsc -b`, which the repo has a
pre-existing set of type errors for unrelated to this migration - see
"Common errors" below). Confirms the bundle builds and that `VITE_API_URL`
isn't baked in as a literal `localhost` value anywhere.

## Common errors and fixes

- **`tsc -b` fails with pre-existing errors** (`AccountTerminatePage.tsx`,
  `DeactivateDomainPage.tsx`, etc., all a Material Web Components
  `onClose` prop typing mismatch, plus one unused variable in
  `ListingSettingsPage.tsx`) - these predate this migration and are not
  introduced by it. `npx vite build` alone (without `tsc -b`) succeeds and
  produces a working bundle; fixing the type errors is separate frontend
  work, not part of this migration. If Pages' build command must exactly
  match `pnpm build` (which does run `tsc -b`), fix these first or the
  Pages build will fail identically.
- **404 on a client-side route after refresh** - `_redirects` missing from
  the deployed output; confirm it's in `frontend/public/` (Vite copies
  `public/` verbatim into `dist/`) and wasn't excluded by a `.pagesignore`.
- **API calls go to `localhost:8081` in production** - `VITE_API_URL` wasn't
  set for the Production environment before the last build; redeploy after
  setting it (Pages doesn't hot-reload env vars into an already-built
  bundle).

## Rollback

Pages keeps every previous deployment. Pages -> your project ->
Deployments -> select a prior deployment -> "Rollback to this deployment".
This is instant and doesn't require a new build. To fully back out of
Pages, repoint the `app.amelu.org` DNS record at the previous frontend host
(see `DNS_AND_MAIL.md` "Rollback").
