## What does this change?

<!-- A short description of the problem and your approach. -->

## Why?

<!-- What prompted this change? Link an issue if there is one. -->

## How was this tested?

<!-- go test ./..., manual testing steps, screenshots for UI changes, etc. -->

## Checklist

- [ ] `go build ./... && go vet ./... && go test ./...` passes (if backend changed)
- [ ] `npm test` passes in `cloudflare/edge` (if the edge Worker changed)
- [ ] I've read [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`LICENSE.md`](../LICENSE.md#4-contributions)
- [ ] I followed the conventions in `AGENTS.md` (no new abstractions/config knobs without a real need, mirrored existing patterns)
