// Applied to every response this Worker returns, proxied or not. This is a
// JSON API only (no HTML is ever served from here), so the policy is
// deliberately locked down rather than tuned for a page that renders
// content.
export function applySecurityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
}

/**
 * Amelu's dashboard/API responses always carry a session cookie or are
 * about to receive one; nothing coming out of this Worker is safe for a
 * shared cache (browser or Cloudflare edge cache) to store and replay to a
 * different user. Applied unconditionally on every proxied response.
 */
export function applyNoStore(headers: Headers): void {
  headers.set("Cache-Control", "no-store");
}
