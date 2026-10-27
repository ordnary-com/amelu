import type { Env } from "./types";

/**
 * The mail relay for the Go origin, reached as http://mail.internal/send from
 * inside the container (see AmeluOriginContainer.outboundByHost). The Go code
 * can't hold a Workers binding, so it hands each mail to this handler, which
 * sends it with the EMAIL send_email binding (Cloudflare Email Sending).
 *
 * Only the container can reach this: mail.internal resolves inside the
 * container network alone, and the edge's public fetch handler has no route
 * to it. The binding itself only allows the sender addresses listed in
 * wrangler.jsonc.
 */

interface RelayRequest {
  fromEmail?: unknown;
  fromName?: unknown;
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
}

const json = (status: number, body: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const str = (value: unknown) => (typeof value === "string" ? value : "");

export async function relayMail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/send") {
    return json(404, { code: "NOT_FOUND", error: "only POST /send is relayed" });
  }
  if (!env.EMAIL) {
    return json(503, { code: "MAIL_UNAVAILABLE", error: "the EMAIL send_email binding is not configured" });
  }

  let body: RelayRequest;
  try {
    body = (await request.json()) as RelayRequest;
  } catch {
    return json(400, { code: "INVALID_JSON", error: "request body is not JSON" });
  }
  const to = str(body.to);
  const subject = str(body.subject);
  const fromEmail = str(body.fromEmail);
  if (!to || !subject || !fromEmail) {
    return json(400, { code: "MISSING_FIELDS", error: "to, subject and fromEmail are required" });
  }

  try {
    const result = await env.EMAIL.send({
      from: { email: fromEmail, name: str(body.fromName) },
      to,
      subject,
      html: str(body.html) || undefined,
      text: str(body.text) || undefined,
    });
    return json(200, { id: result.messageId });
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ msg: "mail relay send failed", code, error: message, subject }));
    return json(502, { code: typeof code === "string" ? code : "SEND_FAILED", error: message });
  }
}
