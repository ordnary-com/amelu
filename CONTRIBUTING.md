# Contributing to Amelu

Thanks for taking the time to contribute. Amelu is [source-available, not open
source](LICENSE.md) — read the license before you start, since it affects what
you can do with a fork beyond preparing a contribution.

## Before you start

- **Small fixes and bug reports**: just open an issue or a pull request.
- **Larger changes**: open an issue first to discuss the approach before
  writing a lot of code. This project has an established Go/React style (see
  `AGENTS.md`) and we'd rather steer you before the work than after.

## Development setup

```bash
git clone https://github.com/ordnary-com/amelu.git
cd amelu
pnpm install
cp backend/.env.example backend/.env   # fill in DATABASE_URL, STALWART_*
pnpm dev
```

See the [README](README.md#getting-started) for prerequisites and more detail.

## Conventions

Before editing, skim `AGENTS.md` at the repo root. The short version:

- No web framework on the backend (stdlib `net/http`, 1.22+ pattern routing).
  No ORM (hand-written SQL via `pgx`).
- Before adding a new frontend page, sidebar section, or backend resource,
  find and mirror the closest existing example rather than inventing a new
  shape.
- No comments explaining *what* code does, only *why*, and only when it's
  genuinely non-obvious.
- Don't add abstractions, config knobs, or validation for cases that can't
  actually happen in this codebase.

## Tests

Run these before opening a pull request:

```bash
cd backend && go build ./... && go vet ./... && go test ./...
cd cloudflare/edge && npm test
```

CI runs the same checks on every pull request (see `.github/workflows/`).

## Commit messages

Explain *why* a change was made, not just what changed. Keep unrelated
changes in separate commits.

## Submitting a pull request

1. Fork the repository and create a branch for your change.
2. Make sure tests pass locally.
3. Open a pull request against `main` describing the problem and your
   approach.
4. By submitting a contribution, you agree to the terms in
   [`LICENSE.md`](LICENSE.md#4-contributions): you're granting Ordnary a
   license to use it, and confirming you have the right to grant that.

## Reporting a security issue

Don't open a public issue for security vulnerabilities. Email
**abuse@amelu.org** instead — see [`docs/cloudflare/SECURITY.md`](docs/cloudflare/SECURITY.md)
for more context on our production security posture.

## Code of conduct

Be respectful and assume good faith. We'll remove comments or close issues
that are abusive, and may block repeat offenders.
