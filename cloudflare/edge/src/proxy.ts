import type { Env } from "./types";
import { signOriginRequest } from "./sign";
import { applyNoStore, applySecurityHeaders } from "./security";
import { corsHeaders } from "./cors";

// Headers that must never be copied straight from the client request to
// the origin request (Workers/Cloudflare manage these, or they'd leak
// edge-internal details / let a client spoof origin trust).
const STRIP_REQUEST_HEADERS = new Set(["host", "cf-connecting-ip", "cf-ray", "cf-visitor", "x-origin-shared-secret"]);

export function requestId(incoming: Request): string {
  return incoming.headers.get("X-Request-Id") ?? crypto.randomUUID();
}

/**
 * Builds the request sent to the private Go origin. The body is passed
 * through untouched (same ReadableStream / same ArrayBuffer reference,
 * never re-parsed or re-serialized) so the raw bytes of a Stripe webhook
 * payload survive byte-for-byte to the signature check in
 * backend/internal/handlers/billing.go.
 */
export async function buildOriginRequest(
  incoming: Request,
  env: Env,
  reqId: string,
): Promise<Request> {
  const url = new URL(incoming.url);
  const originURL = new URL(env.ORIGIN_BASE_URL);
  originURL.pathname = url.pathname;
  originURL.search = url.search;

  const headers = new Headers();
  for (const [key, value] of incoming.headers.entries()) {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }
  headers.set("X-Request-Id", reqId);
  headers.set(
    "X-Origin-Shared-Secret",
    await signOriginRequest(env.ORIGIN_SHARED_SECRET, incoming.method, url.pathname),
  );
  const forwardedFor = incoming.headers.get("CF-Connecting-IP");
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);

  const hasBody = !(incoming.method === "GET" || incoming.method === "HEAD");
  return new Request(originURL.toString(), {
    method: incoming.method,
    headers,
    // `incoming.body` is the raw, unread ReadableStream - streamed straight
    // through, never buffered/decoded/re-encoded here. See
    // docs/cloudflare/EDGE_WORKER.md "Streaming and the raw Stripe body".
    body: hasBody ? incoming.body : undefined,
    // Required by the Workers runtime when forwarding a streaming body on
    // a Request constructed from another Request.
    duplex: hasBody ? "half" : undefined,
    // fetch() defaults to following redirects itself, which would silently
    // swallow the origin's 3xx (e.g. the OAuth login/callback redirects in
    // internal/ordnaryauth) and return the followed response instead. A
    // transparent proxy must pass redirects through untouched.
    redirect: "manual",
  } as RequestInit);
}

/**
 * Copies the origin's response through unchanged (status, headers, body
 * stream), then layers on security headers, no-store, CORS, and the
 * request id - never buffers the body, so large/streamed responses aren't
 * held in Worker memory.
 */
export function buildClientResponse(
  originResponse: Response,
  env: Env,
  reqId: string,
  requestOrigin: string | null,
): Response {
  const headers = new Headers(originResponse.headers);
  applySecurityHeaders(headers);
  applyNoStore(headers);
  headers.set("X-Request-Id", reqId);
  for (const [key, value] of corsHeaders(env.ALLOWED_ORIGIN, requestOrigin).entries()) {
    headers.set(key, value);
  }
  return new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers,
  });
}

export function stableErrorResponse(
  env: Env,
  reqId: string,
  requestOrigin: string | null,
  status: number,
  message: string,
): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  applySecurityHeaders(headers);
  applyNoStore(headers);
  headers.set("X-Request-Id", reqId);
  for (const [key, value] of corsHeaders(env.ALLOWED_ORIGIN, requestOrigin).entries()) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify({ error: message, requestId: reqId }), { status, headers });
}
