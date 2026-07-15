import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// These exercise the Worker's actual fetch() entrypoint end-to-end inside
// the workerd runtime (via SELF, see vitest.config.ts). ORIGIN_BASE_URL in
// the test environment (https://origin.test.invalid) is deliberately
// unreachable - that's what lets us assert the error-handling path
// deterministically without standing up a real origin. Header/body
// transformation logic itself is covered in unit.test.ts against the pure
// functions directly.

describe("edge worker: health endpoints", () => {
  it("GET /healthz answers at the edge without contacting the origin", async () => {
    const res = await SELF.fetch("https://api.amelu.org/healthz");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "amelu-edge-api" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET /healthz/upstream reports a stable 502 when the origin is unreachable", async () => {
    const res = await SELF.fetch("https://api.amelu.org/healthz/upstream");
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("requestId");
  });
});

describe("edge worker: CORS", () => {
  it("answers OPTIONS preflight without touching the origin", async () => {
    const res = await SELF.fetch("https://api.amelu.org/api/domains", {
      method: "OPTIONS",
      headers: { Origin: "https://app.amelu.org" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.amelu.org");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("never reflects an arbitrary Origin header back", async () => {
    const res = await SELF.fetch("https://api.amelu.org/api/domains", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.amelu.org");
  });
});

describe("edge worker: proxying and error responses", () => {
  it("returns a stable JSON error, with a request id and CORS headers, when the origin is unreachable", async () => {
    const res = await SELF.fetch("https://api.amelu.org/api/me", {
      headers: { Origin: "https://app.amelu.org", Cookie: "amelu_session=abc123" },
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.amelu.org");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("upstream request failed");
  });

  it("propagates a client-supplied X-Request-Id into the error response", async () => {
    const res = await SELF.fetch("https://api.amelu.org/api/me", {
      headers: { "X-Request-Id": "test-request-id-123" },
    });
    expect(res.headers.get("X-Request-Id")).toBe("test-request-id-123");
  });

  it("applies security headers even on an error response", async () => {
    const res = await SELF.fetch("https://api.amelu.org/api/me");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
