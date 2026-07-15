// Mirrors backend/internal/handlers/cors.go: a single configured origin,
// credentials allowed, so Access-Control-Allow-Origin can never be "*".
// Kept as its own module so tests can exercise it without going through
// the full proxy path.
export function corsHeaders(allowedOrigin: string, requestOrigin: string | null): Headers {
  const headers = new Headers();
  // Only ever echo back the configured origin, never the request's Origin
  // header verbatim - an attacker-controlled Origin must not be reflected.
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  void requestOrigin;
  return headers;
}

export function isPreflight(request: Request): boolean {
  return request.method === "OPTIONS";
}

export function preflightResponse(allowedOrigin: string, requestOrigin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(allowedOrigin, requestOrigin),
  });
}
