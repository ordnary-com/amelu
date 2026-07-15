// Signs internal job requests exactly like
// backend/internal/auth/internal.go's SignInternalRequest: timestamp +
// HMAC-SHA256 over "<method> <path>.<timestamp>". Sent as the
// X-Amelu-Internal-Signature header (see consumer.ts) with
// INTERNAL_JOBS_SHARED_SECRET - a distinct secret from the edge Worker's
// ORIGIN_SHARED_SECRET, since this consumer calls the origin directly over
// the Tunnel and is never proxied through the edge Worker.
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signOriginRequest(
  secret: string,
  method: string,
  path: string,
  at: Date = new Date(),
): Promise<string> {
  const ts = Math.floor(at.getTime() / 1000).toString();
  const sig = await hmacHex(secret, `${method} ${path}.${ts}`);
  return `${ts}.${sig}`;
}
