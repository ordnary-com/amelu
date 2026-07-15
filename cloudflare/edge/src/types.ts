// Env bindings for the Amelu edge Worker. Secrets are never given defaults
// here - wrangler.jsonc intentionally omits them (see .dev.vars.example and
// docs/cloudflare/SECRETS.md); an empty/missing value must fail closed at
// request time, not silently proxy unauthenticated traffic.
export interface Env {
  // Private origin base URL - in production/preview this is a Cloudflare
  // Tunnel hostname (e.g. https://origin.internal.amelu.org), never a
  // public IP or port. Locally, the Go backend on localhost.
  ORIGIN_BASE_URL: string;

  // Shared secret proving to the Go origin that a request genuinely came
  // through this Worker, not directly from the internet (the Tunnel
  // hostname itself is also not meant to be reachable other than through
  // Cloudflare - this is defense in depth, not the only control).
  ORIGIN_SHARED_SECRET: string;

  // Exact single origin allowed to make credentialed requests (CORS).
  ALLOWED_ORIGIN: string;

  // "development" | "preview" | "production" - informational only, used in
  // a couple of non-security decisions (e.g. verbosity of error bodies).
  ENVIRONMENT?: string;
}
