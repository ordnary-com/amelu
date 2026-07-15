// Header names that must never reach console.log/console.error, even in
// dev/preview. Matched case-insensitively.
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-amelu-internal-signature",
  "x-origin-shared-secret",
  "stripe-signature",
]);

/**
 * Returns a copy of the header set safe to log: sensitive values are
 * replaced with "[redacted]", everything else passes through. Used for
 * diagnostic logging only - never used to decide what gets forwarded to
 * the origin, which always gets the real headers.
 */
export function redactHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? "[redacted]" : value;
  }
  return out;
}

/**
 * Stripe webhook (and any other) request/response bodies are never logged
 * in full - at most a byte length, since even a truncated payload can leak
 * customer/billing data. This intentionally returns a fixed shape rather
 * than a snippet of the body.
 */
export function describeBodyForLog(byteLength: number | null): string {
  return byteLength === null ? "[stream, length unknown]" : `[${byteLength} bytes]`;
}
