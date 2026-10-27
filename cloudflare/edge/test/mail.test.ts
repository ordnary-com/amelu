import { describe, expect, it, vi } from "vitest";
import { relayMail } from "../src/mail";
import type { Env } from "../src/types";

const baseEnv = {
  ORIGIN_BASE_URL: "https://origin.test.invalid",
  ORIGIN_SHARED_SECRET: "s",
  ALLOWED_ORIGIN: "https://app.amelu.org",
  DATABASE_URL: "postgres://test",
  STALWART_BASE_URL: "https://stalwart.test.invalid",
  STALWART_ADMIN_USER: "t",
  STALWART_ADMIN_PASSWORD: "t",
} as unknown as Env;

const post = (body: unknown, path = "/send") =>
  new Request(`http://mail.internal${path}`, { method: "POST", body: JSON.stringify(body) });

const mail = { fromEmail: "onboarding@ordnary.com", fromName: "Amelu", to: "a@example.com", subject: "Set up your password", html: "<p>x</p>", text: "x" };

describe("mail relay", () => {
  it("sends through the EMAIL binding and returns the message id", async () => {
    const send = vi.fn(async () => ({ messageId: "cf_1" }));
    const res = await relayMail(post(mail), { ...baseEnv, EMAIL: { send } as unknown as SendEmail });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "cf_1" });
    expect(send).toHaveBeenCalledWith({
      from: { email: "onboarding@ordnary.com", name: "Amelu" },
      to: "a@example.com",
      subject: "Set up your password",
      html: "<p>x</p>",
      text: "x",
    });
  });

  it("passes Cloudflare's error code back with a 502", async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error("Daily quota reached"), { code: "E_DAILY_LIMIT_EXCEEDED" });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await relayMail(post(mail), { ...baseEnv, EMAIL: { send } as unknown as SendEmail });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "E_DAILY_LIMIT_EXCEEDED" });
  });

  it("refuses anything but POST /send, and incomplete mails", async () => {
    const env = { ...baseEnv, EMAIL: { send: vi.fn() } as unknown as SendEmail };
    expect((await relayMail(post(mail, "/other"), env)).status).toBe(404);
    expect((await relayMail(post({ ...mail, to: "" }), env)).status).toBe(400);
  });

  it("reports unavailable without the binding", async () => {
    expect((await relayMail(post(mail), baseEnv)).status).toBe(503);
  });
});
