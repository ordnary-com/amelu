// Proves to the Go origin that a request genuinely passed through this
// Worker. Timestamp + HMAC-SHA256 over "<method> <path>.<timestamp>",
// deliberately the same shape as backend/internal/auth/internal.go's
// SignInternalRequest so the two are easy to reason about together, even
// though this header authenticates the general API proxy path while that
// Go helper authenticates the separate /internal/jobs/* routes.
const HEADER_NAME = "X-Origin-Shared-Secret";

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
