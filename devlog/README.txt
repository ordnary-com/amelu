DEVLOG

One entry per change, written the same day. Plain text, no markdown, so an
entry can be pasted straight into a devlog box somewhere.

Rules:

Short. Ten to fifteen lines. If a session produced two unrelated things,
that's two files, not one long one.

Specific. "Fixed a bug in the DNS page" says nothing. Name the endpoint, the
table, the error string.

Say what went wrong, not just what shipped.

Screenshot anything visible. Images go in devlog/images/, mention the
filename in the text.

Read it back before committing.

Filename: YYYY-MM-DD-short-slug.txt
Start with a title line and the date, blank line, then the text.


ENTRIES

2026-10-09  Ordnary's own domains can no longer be added as customer domains
            2026-10-09-reserved-domains.txt

2026-10-08  Forwarding still broken for existing forwards (GitHub issue 2)
            2026-10-08-forwarding-scripts-redeployed.txt

2026-10-08  Plans could not be bought in production: test-mode price IDs
            2026-10-08-stripe-price-lookup-keys.txt

2026-10-08  Checkout replaces a Stripe customer Stripe no longer knows
            2026-10-08-checkout-stripe-customer.txt

2026-10-08  Login shows progress while redirecting to Ordnary
            2026-10-08-login-loading-overlay.txt

2026-10-08  Login button uses the blue Ordnary mark
            2026-10-08-blue-ordnary-mark.txt

2026-10-08  Login with Ordnary account failed with ordnary_auth_failed
            2026-10-08-ordnary-login-fraud-guard.txt

2026-09-15  SRV records now receive a real live DNS status
            2026-09-15-verify-srv-records.txt

2026-09-15  Forwarding no longer depends on a clean-mail header being present
            2026-09-15-forward-without-spam-header.txt

2026-09-14  Dashboard support route and published contact addresses repaired
            2026-09-14-working-support-channels.txt

2026-09-14  Customer HTTPS discovery records hidden until TLS supports them
            2026-09-14-suppress-unsafe-customer-tls-records.txt

2026-08-11  Mail cluster down to one node: marduk, backup MX removed
            2026-08-11-single-mail-node.txt

2026-07-31  Dark mode shipped invisible behind a cached stylesheet
            2026-07-31-dark-mode-stale-css.txt

2026-07-30  Read and send mail over HTTP, so agents don't need IMAP
            2026-07-30-mail-over-http.txt

2026-07-30  API keys, the sidebar item that was greyed out
            2026-07-30-api-keys.txt

2026-07-30  Dropped the "two-factor isn't available yet" tip
            2026-07-30-remove-2fa-tip.txt

2026-07-30  Changelog moved to the header, Service Status out of the sidebar
            2026-07-30-nav-changelog-status.txt

2026-07-30  Light, dark and system theme under My Account
            2026-07-30-theme-setting.txt

2026-07-30  Wrote down how accounts are actually secured
            2026-07-30-security-section.txt

2026-07-30  Self-hosting for personal use is allowed now
            2026-07-30-self-hosting-license.txt

2026-07-30  Devlogs live in the repo now
            2026-07-30-devlogs-in-repo.txt
