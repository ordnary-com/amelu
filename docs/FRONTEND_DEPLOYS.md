# Frontend deploys (current state)

This documents how `frontend/` actually gets to production today, as of the
Cloudflare Pages migration. It reflects the real deployed state (project
names, domain, known issues) — for the general Cloudflare Pages setup
reference, see `docs/cloudflare/PAGES_FRONTEND.md`.

## Where it lives

- Cloudflare Pages project: `amelu-frontend`
- Production domain: `https://app.amelu.org`
- Every deploy also gets its own `https://<hash>.amelu-frontend.pages.dev` URL

## Deploying manually

```bash
cd frontend
VITE_API_URL=https://api.amelu.org npx vite build
npx wrangler pages deploy dist --project-name amelu-frontend --branch main
```

Deploys to the `main` branch are what `app.amelu.org` serves. This takes
about 10-15 seconds end to end - no build server, no VPS involved. Requires
being logged in to the right Cloudflare account (`npx wrangler whoami` to
check).

### Known issue: don't use `pnpm build` yet

`pnpm build` runs `tsc -b && vite build`. `tsc -b` currently fails on a few
pre-existing type errors (a Material dialog wrapper's `onClose` prop isn't
typed on the underlying element, plus one unused variable) - unrelated to
the Cloudflare migration. Until those are fixed, deploy with `vite build`
directly (skips the type-check step, matches what's already deployed) as
shown above.

## For other developers

There is **no CI/CD deploying automatically yet**. `.github/workflows/`
already has stubbed workflows (build+test on every PR, PR preview deploy,
production deploy gated behind manual `workflow_dispatch` on `main`), but
they are intentionally inactive - no Cloudflare API token is configured as
a GitHub secret yet, so nothing deploys from CI today.

Until that's turned on, anyone deploying needs:

- `wrangler` available (via `npx wrangler`, already a devDependency)
- Their own Cloudflare login (`npx wrangler login`) with access to the
  `amelu-frontend` Pages project, or a scoped API token
- To run the manual command above

There's no review gate on manual deploys - whoever runs the command ships
straight to `app.amelu.org`. If/when the team grows, the next step is
turning on the PR-preview workflow (needs a Workers+Pages-scoped Cloudflare
API token added as a GitHub secret) so PRs get their own preview URL and
production only deploys via an explicit, reviewed `workflow_dispatch`.

## Rollback

Every deploy is a Pages "deployment" that stays listed in the dashboard
(Workers & Pages -> amelu-frontend -> Deployments). To roll back:

```bash
npx wrangler pages deployment list --project-name amelu-frontend
```

Find the previous good deployment ID, then re-promote it via the dashboard
(Deployments -> [deployment] -> "Rollback to this deployment") - there is
currently no CLI command for promoting an old deployment to production, it
must be done from the dashboard.
