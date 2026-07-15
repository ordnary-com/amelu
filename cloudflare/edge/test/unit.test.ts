import { describe, expect, it } from "vitest";
import { corsHeaders, isPreflight, preflightResponse } from "../src/cors";
import { describeBodyForLog, redactHeaders } from "../src/redact";
import { signOriginRequest } from "../src/sign";
import { applyNoStore, applySecurityHeaders } from "../src/security";
import { buildClientResponse, buildOriginRequest, requestId, stableErrorResponse } from "../src/proxy";
import type { Env } from "../src/types";

const env: Env = {
  ORIGIN_BASE_URL: "https://origin.test.invalid",
  ORIGIN_SHARED_SECRET: "test-shared-secret",
  ALLOWED_ORIGIN: "https://app.amelu.org",
  ENVIRONMENT: "test",
};

describe("cors", () => {
  it("always echoes the configured origin, never the request Origin header", () => {
    const headers = corsHeaders(env.ALLOWED_ORIGIN, "https://evil.example");
    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://app.amelu.org");
    expect(headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(headers.get("Vary")).toBe("Origin");
  });

  it("detects preflight requests", () => {
    const req = new Request("https://api.amelu.org/api/domains", { method: "OPTIONS" });
    expect(isPreflight(req)).toBe(true);
    expect(isPreflight(new Request("https://api.amelu.org/api/domains"))).toBe(false);
  });

  it("preflight response is 204 with no body and CORS headers", async () => {
    const res = preflightResponse(env.ALLOWED_ORIGIN, "https://app.amelu.org");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.amelu.org");
  });
});

describe("redaction", () => {
  it("redacts sensitive headers but keeps others", () => {
    const headers = new Headers({
      Authorization: "Bearer super-secret",
      Cookie: "amelu_session=abc123",
      "Stripe-Signature": "t=1,v1=deadbeef",
      "Content-Type": "application/json",
      "X-Request-Id": "req-1",
    });
    const redacted = redactHeaders(headers);
    expect(redacted["authorization"]).toBe("[redacted]");
    expect(redacted["cookie"]).toBe("[redacted]");
    expect(redacted["stripe-signature"]).toBe("[redacted]");
    expect(redacted["content-type"]).toBe("application/json");
    expect(redacted["x-request-id"]).toBe("req-1");
  });

  it("never includes actual body content in log descriptions", () => {
    expect(describeBodyForLog(128)).toBe("[128 bytes]");
    expect(describeBodyForLog(null)).toBe("[stream, length unknown]");
  });
});

describe("security headers", () => {
  it("applies a locked-down header set", () => {
    const headers = new Headers();
    applySecurityHeaders(headers);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("marks responses as never cacheable", () => {
    const headers = new Headers();
    applyNoStore(headers);
    expect(headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("sign", () => {
  it("produces a timestamp.hex signature and is deterministic for a fixed time", async () => {
    const at = new Date("2026-07-15T12:00:00Z");
    const sig1 = await signOriginRequest("secret", "POST", "/api/webhooks/stripe", at);
    const sig2 = await signOriginRequest("secret", "POST", "/api/webhooks/stripe", at);
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });

  it("changes signature when path or secret changes", async () => {
    const at = new Date("2026-07-15T12:00:00Z");
    const base = await signOriginRequest("secret", "GET", "/api/me", at);
    const differentPath = await signOriginRequest("secret", "GET", "/api/domains", at);
    const differentSecret = await signOriginRequest("other-secret", "GET", "/api/me", at);
    expect(differentPath).not.toBe(base);
    expect(differentSecret).not.toBe(base);
  });
});

describe("proxy: request id", () => {
  it("forwards an existing X-Request-Id instead of overwriting it", () => {
    const req = new Request("https://api.amelu.org/api/me", { headers: { "X-Request-Id": "client-provided" } });
    expect(requestId(req)).toBe("client-provided");
  });

  it("generates one when absent", () => {
    const req = new Request("https://api.amelu.org/api/me");
    expect(requestId(req)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("proxy: header handling", () => {
  it("strips hop-by-hop / edge-internal headers and never trusts a client-supplied origin secret", async () => {
    const req = new Request("https://api.amelu.org/api/me", {
      headers: {
        Cookie: "amelu_session=abc123",
        Host: "api.amelu.org",
        "CF-Connecting-IP": "203.0.113.5",
        "X-Origin-Shared-Secret": "attacker-supplied-value",
      },
    });
    const originReq = await buildOriginRequest(req, env, "req-1");
    expect(originReq.headers.get("Cookie")).toBe("amelu_session=abc123");
    expect(originReq.headers.get("Host")).not.toBe("api.amelu.org");
    expect(originReq.headers.get("X-Forwarded-For")).toBe("203.0.113.5");
    // The Worker's own signature must win - a client can't inject a fake one.
    expect(originReq.headers.get("X-Origin-Shared-Secret")).not.toBe("attacker-supplied-value");
    expect(originReq.headers.get("X-Origin-Shared-Secret")).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(originReq.headers.get("X-Request-Id")).toBe("req-1");
  });

  it("rewrites the URL to the origin base while preserving path and query", async () => {
    const req = new Request("https://api.amelu.org/api/domains?status=active&limit=10");
    const originReq = await buildOriginRequest(req, env, "req-1");
    expect(originReq.url).toBe("https://origin.test.invalid/api/domains?status=active&limit=10");
  });

  it("omits a body for GET/HEAD but preserves it for methods that carry one", async () => {
    const getReq = new Request("https://api.amelu.org/api/me", { method: "GET" });
    const getOriginReq = await buildOriginRequest(getReq, env, "req-1");
    expect(getOriginReq.body).toBeNull();

    const postReq = new Request("https://api.amelu.org/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "example.com" }),
    });
    const postOriginReq = await buildOriginRequest(postReq, env, "req-1");
    expect(await postOriginReq.text()).toBe(JSON.stringify({ name: "example.com" }));
  });
});

describe("proxy: Stripe raw body preservation", () => {
  it("forwards the exact raw bytes of a Stripe webhook body, untouched", async () => {
    // A byte sequence that would break if anything JSON-decoded and
    // re-encoded it (whitespace, key order, unicode all matter to Stripe's
    // signature check, which HMACs the raw bytes).
    const rawBody = '{"id":"evt_123",  "object":"event", "data":{"object":{"amount":1000}}}\né';
    const req = new Request("https://api.amelu.org/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": "t=1700000000,v1=deadbeefcafe",
      },
      body: rawBody,
    });

    const originReq = await buildOriginRequest(req, env, "req-1");
    const forwardedBody = await originReq.text();

    expect(forwardedBody).toBe(rawBody);
    expect(originReq.headers.get("Stripe-Signature")).toBe("t=1700000000,v1=deadbeefcafe");
  });

  it("preserves raw bytes even for binary-ish content", async () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 10, 13, 34, 92]);
    const req = new Request("https://api.amelu.org/api/webhooks/stripe", {
      method: "POST",
      body: bytes,
    });
    const originReq = await buildOriginRequest(req, env, "req-1");
    const forwarded = new Uint8Array(await originReq.arrayBuffer());
    expect([...forwarded]).toEqual([...bytes]);
  });
});

describe("proxy: response handling", () => {
  it("copies origin status/body and layers on security + CORS + no-store headers", async () => {
    const originResponse = new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
    const clientResponse = buildClientResponse(originResponse, env, "req-1", "https://app.amelu.org");
    expect(clientResponse.status).toBe(201);
    expect(await clientResponse.json()).toEqual({ ok: true });
    expect(clientResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(clientResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(clientResponse.headers.get("Access-Control-Allow-Origin")).toBe("https://app.amelu.org");
    expect(clientResponse.headers.get("X-Request-Id")).toBe("req-1");
  });

  it("stableErrorResponse returns a stable, well-formed JSON error shape", async () => {
    const res = stableErrorResponse(env, "req-1", "https://app.amelu.org", 502, "upstream request failed");
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: "upstream request failed", requestId: "req-1" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.amelu.org");
  });
});
