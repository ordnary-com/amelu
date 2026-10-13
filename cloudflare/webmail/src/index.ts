// Proxies webmail.amelu.org to Roundcube on the mail host. The origin is
// addressed by the name on its certificate; Roundcube is told the public
// name through X-Forwarded-Host (nginx on the host sets Host from it).
const ORIGIN = "https://marduk.mx.amelu.org:8443";

// Hop-by-hop and Cloudflare-internal headers the origin must not see.
const STRIP = new Set(["host", "cf-connecting-ip", "cf-ray", "cf-visitor", "cf-ipcountry", "x-forwarded-proto", "x-forwarded-host"]);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = new Headers();
    for (const [key, value] of request.headers) {
      if (!STRIP.has(key.toLowerCase())) headers.set(key, value);
    }
    headers.set("X-Forwarded-Host", url.host);
    headers.set("X-Forwarded-Proto", "https");
    const clientIP = request.headers.get("CF-Connecting-IP");
    if (clientIP) headers.set("X-Forwarded-For", clientIP);

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await fetch(ORIGIN + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Redirects belong to the browser; following them here would hide
      // Roundcube's login/logout round trips.
      redirect: "manual",
    } as RequestInit);

    const out = new Headers(upstream.headers);
    const location = out.get("Location");
    if (location?.startsWith(ORIGIN)) out.set("Location", "https://" + url.host + location.slice(ORIGIN.length));
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  },
} satisfies ExportedHandler;
