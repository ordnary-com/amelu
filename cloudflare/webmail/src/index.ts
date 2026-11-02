// Proxies webmail.amelu.org, organizations' <name>.webmail.amelu.org and
// their own hostnames (Cloudflare custom hostnames, each with a route here
// made by the API) to Roundcube on the mail host. The origin is addressed by
// the name on its certificate; Roundcube is told the public name through
// X-Forwarded-Host, and its amelu_theme plugin brands itself by that name.
const ORIGIN = "https://marduk.mx.amelu.org:8443";
const SHARED_HOST = "webmail.amelu.org";

interface Env {
  API_ORIGIN: string;
}

// Hop-by-hop and Cloudflare-internal headers the origin must not see.
const STRIP = new Set(["host", "cf-connecting-ip", "cf-ray", "cf-visitor", "cf-ipcountry", "x-forwarded-proto", "x-forwarded-host"]);

const NOT_FOUND_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;color:#1f2937;background:#f7f8fa}main{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 6px}p{margin:0;color:#6b7280}</style></head>
<body><main><h1>There is no webmail here</h1><p>Check the address, or ask whoever gave it to you.</p></main></body></html>`;

// The page Roundcube shows in an empty preview pane: the organization's logo,
// muted, instead of Amelu's.
const WATERMARK_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title></title><style>
html,body{height:100%;margin:0;overflow:hidden}body{background:#fff url(/__brand/logo) center/120px no-repeat}
body:before{content:"";position:absolute;inset:0;background:rgba(255,255,255,.82)}
html.dark-mode>body{background-color:#21292c}html.dark-mode>body:before{background:rgba(33,41,44,.82)}
</style><script>try{if(parent.document.documentElement.classList.contains("dark-mode"))document.documentElement.classList.add("dark-mode")}catch(e){}</script></head><body></body></html>`;

/** Whether an organization's branding exists for this host (cached a minute at the edge). */
async function brandingExists(env: Env, host: string): Promise<boolean> {
  const res = await fetch(`${env.API_ORIGIN}/api/webmail-branding?host=${encodeURIComponent(host)}`, {
    cf: { cacheTtl: 60, cacheEverything: true },
  } as RequestInit);
  return res.ok;
}

async function brandRoute(env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/__brand/logo" || url.pathname === "/favicon.ico") {
    const res = await fetch(`${env.API_ORIGIN}/api/webmail-branding/logo?host=${encodeURIComponent(url.host)}`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return url.pathname === "/favicon.ico" ? null : new Response("Not found", { status: 404 });
    const headers = new Headers(res.headers);
    headers.set("Content-Security-Policy", "default-src 'none'");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(res.body, { status: 200, headers });
  }
  if (url.pathname === "/__brand/watermark") {
    return new Response(WATERMARK_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.host !== SHARED_HOST) {
      if (!(await brandingExists(env, url.host))) {
        return new Response(NOT_FOUND_PAGE, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const brand = await brandRoute(env, url);
      if (brand) return brand;
    }

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
} satisfies ExportedHandler<Env>;
