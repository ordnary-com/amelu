import { describe, expect, it, vi, beforeEach } from "vitest";
import { backoffSeconds, verifyDomain, persistVerified, __resetDedupCacheForTests } from "../src/consumer";
import consumer from "../src/consumer";
import type { DomainVerificationMessage, Env } from "../src/types";

const env: Env = {
  ORIGIN_BASE_URL: "https://origin.test.invalid",
  INTERNAL_JOBS_SHARED_SECRET: "test-shared-secret",
  ENVIRONMENT: "test",
};

function dohResponse(values: string[]) {
  return new Response(JSON.stringify({ Answer: values.map((v) => ({ data: `"${v}"` })) }), {
    status: 200,
    headers: { "Content-Type": "application/dns-json" },
  });
}

function makeMessage(body: DomainVerificationMessage, attempts = 1) {
  return {
    id: body.idempotencyKey,
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

beforeEach(() => {
  __resetDedupCacheForTests();
});

describe("backoffSeconds", () => {
  it("grows exponentially and caps at 600s", () => {
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(2)).toBe(60);
    expect(backoffSeconds(3)).toBe(120);
    expect(backoffSeconds(10)).toBe(600);
  });
});

describe("verifyDomain", () => {
  const msg: DomainVerificationMessage = {
    idempotencyKey: "domain-abc-key1",
    domainId: "domain-abc",
    domainName: "example.com",
    expectedTxtRecord: { name: "_amelu-verify.example.com", value: "amelu-verify=xyz" },
    enqueuedAt: new Date().toISOString(),
  };

  it("reports verified when the TXT record matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(dohResponse(["amelu-verify=xyz"]));
    const outcome = await verifyDomain(msg, fetchImpl);
    expect(outcome.verified).toBe(true);
    expect(outcome.domainId).toBe("domain-abc");
  });

  it("reports not verified when the TXT record is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(dohResponse([]));
    const outcome = await verifyDomain(msg, fetchImpl);
    expect(outcome.verified).toBe(false);
    expect(outcome.reason).toContain("not found");
  });

  it("reports not verified (not throws) when the DoH lookup itself fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const outcome = await verifyDomain(msg, fetchImpl);
    expect(outcome.verified).toBe(false);
    expect(outcome.reason).toContain("dns lookup error");
  });

  it("is idempotent for duplicate delivery: same idempotency key skips a second DNS lookup", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(dohResponse(["amelu-verify=xyz"]));
    const first = await verifyDomain(msg, fetchImpl);
    const second = await verifyDomain(msg, fetchImpl); // simulates at-least-once redelivery
    expect(first).toEqual(second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats a different idempotency key as an independent verification", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(dohResponse(["amelu-verify=xyz"]));
    await verifyDomain(msg, fetchImpl);
    await verifyDomain({ ...msg, idempotencyKey: "domain-abc-key2" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("persistVerified", () => {
  it("signs the internal request and posts domainId + idempotencyKey", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await persistVerified(
      env,
      { idempotencyKey: "k1", domainId: "domain-abc", verified: true },
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://origin.test.invalid/internal/jobs/domain-verified");
    const headers = init.headers as Headers;
    expect(headers.get("X-Amelu-Internal-Signature")).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(init.body).toBe(JSON.stringify({ domainId: "domain-abc", idempotencyKey: "k1" }));
  });

  it("throws when the origin rejects the persist call, so the caller retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      persistVerified(env, { idempotencyKey: "k1", domainId: "domain-abc", verified: true }, fetchImpl),
    ).rejects.toThrow();
  });
});

describe("queue consumer: retry and duplicate delivery", () => {
  it("retries with backoff when the domain is not yet verified", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(dohResponse([])) as unknown as typeof fetch;
    try {
      const msg = makeMessage(
        {
          idempotencyKey: "retry-key-1",
          domainId: "domain-retry",
          domainName: "notyet.example.com",
          expectedTxtRecord: { name: "_amelu-verify.notyet.example.com", value: "amelu-verify=abc" },
          enqueuedAt: new Date().toISOString(),
        },
        2,
      );
      await consumer.queue({ messages: [msg] } as unknown as MessageBatch<DomainVerificationMessage>, env);
      expect(msg.retry).toHaveBeenCalledTimes(1);
      expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: backoffSeconds(2) });
      expect(msg.ack).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("acks once verified and persisted, and duplicate delivery of the same message does not double-call the origin's DNS lookup", async () => {
    const originalFetch = globalThis.fetch;
    let dohCalls = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const s = url.toString();
      if (s.includes("dns-query")) {
        dohCalls++;
        return dohResponse(["amelu-verify=match"]);
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const body: DomainVerificationMessage = {
        idempotencyKey: "dup-key-1",
        domainId: "domain-dup",
        domainName: "dup.example.com",
        expectedTxtRecord: { name: "_amelu-verify.dup.example.com", value: "amelu-verify=match" },
        enqueuedAt: new Date().toISOString(),
      };
      const msg1 = makeMessage(body, 1);
      const msg2 = makeMessage(body, 1); // duplicate delivery, same idempotency key

      await consumer.queue({ messages: [msg1, msg2] } as unknown as MessageBatch<DomainVerificationMessage>, env);

      expect(msg1.ack).toHaveBeenCalledTimes(1);
      expect(msg2.ack).toHaveBeenCalledTimes(1);
      // The DNS lookup itself only ran once - the second delivery reused
      // the cached verification outcome.
      expect(dohCalls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
