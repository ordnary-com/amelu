# R2 Storage

Last verified against Cloudflare documentation: 2026-07-15.

Source: `backend/internal/objectstore/`.

## What this is for (and explicitly not for)

Private, EU-jurisdiction object storage for: async CSV exports (mailbox
lists, address alias lists - the dashboard already has synchronous CSV
export/import via `ExportMailboxesCSV`/`ImportAddressAliasesCSV` etc.;
this is for larger exports worth generating asynchronously), temporary
import staging files, generated reports, support bundles, and optionally
encrypted backups.

**Never live mailbox storage.** Mail data stays on Stalwart's own disk -
re-implementing IMAP-consistent storage semantics on R2 would be rewriting
the mail server, not migrating infrastructure. Safety rule #3.

## Status

`backend/internal/objectstore` defines the `Store` interface and a
`LocalStore` (filesystem) implementation, used today. No R2 implementation
exists in Go yet - see "Adding the R2 implementation" below for what that
would look like when there's a real bucket to build and test against.

## Design

### Bucket

Private, EU jurisdiction, created via `DASHBOARD_SETUP.md` step 8:

```
npx wrangler r2 bucket create amelu-exports-eu --jurisdiction eu
```

Reference: https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions

Bucket name is a placeholder (`${R2_BUCKET_NAME}`) everywhere in this repo -
never hardcoded.

### Object keys - non-guessable, customer-namespaced

`objectstore.NewObjectKey(customerID, kind, filename)` produces:

```
<customerID>/<kind>/<random-16-byte-hex>-<sanitized-filename>
```

- The **random segment**, not the filename or any user input, is what makes
  a key unguessable - never derived from anything predictable (sequential
  ID, timestamp, filename alone).
- `customerID` prefixing is what an authz check keys off:
  `objectstore.OwnerFromKey(key)` extracts it, and every download handler
  must compare it against the requesting customer's own ID before minting a
  signed URL - see "Customer separation" below.
- `sanitizeFilename` strips `/`, `\`, and `..` and leading dots, so a
  caller-supplied filename can only ever contribute a cosmetic suffix, never
  a path-traversal segment. Tested in
  `backend/internal/objectstore/store_test.go`.

### Authenticated download via signed URLs

The Go backend always mints the download URL - the bucket itself is never
public, and no object is ever served by a public R2.dev or custom domain.
`Store.SignedGetURL(ctx, key, expiresIn)` is the interface every handler
calls; `LocalStore`'s implementation signs an HMAC over
`key + "." + expiry`, verified by `LocalStore.VerifyAndOpen` - deliberately
the same shape a real R2 presigned URL has, so handler code never needs a
dev-only branch.

Reference: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

### Customer separation

Two layers:

1. **Key namespace**: `customerID/...` prefix (see above).
2. **Authz check in the handler**: before calling `SignedGetURL`, the
   handler must verify `objectstore.OwnerFromKey(key) ==
   requestingCustomer.ID`. This is application-level, not bucket-level -
   R2 has no per-object ACL model suited to per-customer isolation at this
   granularity, so the Go origin is the enforcement point, same as every
   other authz check in this codebase (`auth.Require` +
   `requireCustomer`).

### MIME/size validation

Not yet implemented (no R2 implementation exists to validate against yet) -
when added, `Store.Put`'s `contentType`/`size` parameters (already part of
the interface) are where a handler-level allowlist (e.g. `text/csv`,
`application/pdf`, `application/zip` for support bundles) and a max-size
check belong, before the bytes are ever written.

### Retention / auto-deletion (R2 lifecycle rules)

Configured per-`Kind` prefix once the bucket exists (not created by this
migration - a `wrangler r2 bucket lifecycle` or dashboard action):

| Kind | Prefix | Suggested retention |
|---|---|---|
| `csv-export` | `*/csv-export/*` | 7 days |
| `import-temp` | `*/import-temp/*` | 24 hours |
| `report` | `*/report/*` | 30 days |
| `support-bundle` | `*/support-bundle/*` | 90 days |
| `encrypted-backup` | `*/encrypted-backup/*` | per backup policy, not auto-deleted by default |

Reference: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

### Never publicly cached

No R2 bucket in this design has a public custom domain or `r2.dev` access
enabled - every read goes through a Go-minted signed URL, which itself is
never cached by the edge Worker (`Cache-Control: no-store` on every
proxied response, see `EDGE_WORKER.md`) or by R2 itself (presigned URLs
aren't edge-cached by default).

### Local dev fallback

`objectstore.LocalStore` (`backend/internal/objectstore/local.go`) - plain
files under a configurable root directory, "signed" URLs served by a
same-process handler that checks the HMAC + expiry. No live Cloudflare
account needed for local development. An S3-compatible alternative
(MinIO) is also a reasonable local substitute if a team prefers exercising
real S3-API semantics (multipart uploads, etc.) - not implemented here since
`LocalStore` already satisfies the `Store` interface without extra
infrastructure.

## Adding the R2 implementation (when adopted)

Not implemented in this migration. When adopted:

1. Add an `R2Store` implementing the same `Store` interface, using the S3
   API (R2 is S3-API-compatible) via the AWS SDK for Go v2, pointed at
   R2's S3-compatible endpoint
   (`https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`).
   Reference: https://developers.cloudflare.com/r2/api/s3/api/
2. Wire it into `config.Load`/`cmd/api/main.go` following the existing
   optional-integration convention (Resend/Stripe/DomainConnect): missing
   R2 credentials means `objectstore` falls back to `LocalStore`, not a
   startup failure.
3. Presigned URL generation uses the SDK's `PresignClient`, matching
   `SignedGetURL`'s existing signature.

## Common errors and fixes

- **403 on a signed URL** - expired (`expiresIn` too short, or the URL was
  used well after generation) or the signature was tampered with (URL
  copied incorrectly, query params reordered by an intermediary) - see
  `LocalStore.VerifyAndOpen`'s explicit expiry/signature checks and their
  tests.
- **Customer A can construct customer B's key** - the random segment in
  `NewObjectKey` makes this computationally infeasible even knowing the
  customerID prefix; the actual risk to guard against is a handler bug that
  skips the `OwnerFromKey` authz check, not key guessing.

## Rollback

`LocalStore` requires no infrastructure to roll back - deleting exported
files is just filesystem cleanup. If an R2 implementation were adopted and
needed to be rolled back, flipping the `config.Load` branch back to
`LocalStore` requires no data migration (nothing in `LocalStore` reads R2
state or vice versa) - only in-flight signed URLs pointing at R2 objects
would need to be treated as invalid going forward.
