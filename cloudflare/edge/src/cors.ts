// Mirrors backend/internal/handlers/cors.go: the configured origins (a comma
// separated list, the current dashboard first), credentials allowed, so
// Access-Control-Allow-Origin can never be "*". Kept as its own module so
// tests can exercise it without going through the full proxy path.
export function corsHeaders(allowedOrigins: string, requestOrigin: string | null): Headers {
  const origins = allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const headers = new Headers();
  // Echo the request's Origin only when it's on the list; an attacker-
  // controlled Origin must never be reflected.
  const allowed = requestOrigin && origins.includes(requestOrigin) ? requestOrigin : (origins[0] ?? "");
  headers.set("Access-Control-Allow-Origin", allowed);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Expose-Headers", "X-Request-Id");
  headers.set("Vary", "Origin");
  return headers;
}

export function isPreflight(request: Request): boolean {
  return request.method === "OPTIONS";
}

export function preflightResponse(allowedOrigins: string, requestOrigin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(allowedOrigins, requestOrigin),
  });
}
