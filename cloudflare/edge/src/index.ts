import type { Env } from "./types";
import { isPreflight, preflightResponse } from "./cors";
import { buildClientResponse, buildOriginRequest, requestId, stableErrorResponse } from "./proxy";
import { redactHeaders } from "./redact";
import { applyNoStore, applySecurityHeaders } from "./security";

// Public edge health check - answered entirely at the edge, no origin
// call, so it stays accurate even during an origin/Tunnel outage (the
// thing an uptime monitor most needs to distinguish: "edge is up" vs
// "origin behind it is up").
function healthzResponse(env: Env, reqId: string, requestOrigin: string | null): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  applySecurityHeaders(headers);
  applyNoStore(headers);
  headers.set("X-Request-Id", reqId);
  return new Response(
    JSON.stringify({ status: "ok", service: "amelu-edge-api", environment: env.ENVIRONMENT ?? "unknown" }),
    { status: 200, headers },
  );
}

// Origin health check - actually reaches the Go backend over the Tunnel.
// Kept as a distinct path (not the public /healthz) so a monitor can tell
// edge-only health apart from full end-to-end health.
async function healthzUpstreamResponse(env: Env, reqId: string, requestOrigin: string | null): Promise<Response> {
  try {
    const originReq = await buildOriginRequest(
      new Request(new URL("/api/healthz", "https://edge.invalid"), { method: "GET" }),
      env,
      reqId,
    );
    const originResp = await fetch(originReq);
    return buildClientResponse(originResp, env, reqId, requestOrigin);
  } catch (err) {
    console.error(
      JSON.stringify({ msg: "origin health check failed", requestId: reqId, error: String(err) }),
    );
    return stableErrorResponse(env, reqId, requestOrigin, 502, "origin is unreachable");
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const reqId = requestId(request);
    const requestOrigin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (isPreflight(request)) {
      return preflightResponse(env.ALLOWED_ORIGIN, requestOrigin);
    }

    if (url.pathname === "/healthz") {
      return healthzResponse(env, reqId, requestOrigin);
    }
    if (url.pathname === "/healthz/upstream") {
      return healthzUpstreamResponse(env, reqId, requestOrigin);
    }

    if (!env.ORIGIN_BASE_URL || !env.ORIGIN_SHARED_SECRET || !env.ALLOWED_ORIGIN) {
      console.error(JSON.stringify({ msg: "worker misconfigured: missing required binding", requestId: reqId }));
      return stableErrorResponse(env, reqId, requestOrigin, 500, "edge worker is misconfigured");
    }

    try {
      const originRequest = await buildOriginRequest(request, env, reqId);
      console.log(
        JSON.stringify({
          msg: "proxying request",
          requestId: reqId,
          method: request.method,
          path: url.pathname,
          headers: redactHeaders(request.headers),
        }),
      );

      const originResponse = await fetch(originRequest);
      return buildClientResponse(originResponse, env, reqId, requestOrigin);
    } catch (err) {
      console.error(
        JSON.stringify({ msg: "origin proxy failed", requestId: reqId, path: url.pathname, error: String(err) }),
      );
      return stableErrorResponse(env, reqId, requestOrigin, 502, "upstream request failed");
    }
  },
} satisfies ExportedHandler<Env>;
