import type { AmeluOriginContainer } from "./container";

// Env bindings for the Amelu edge Worker. Secrets are never given defaults
// here - wrangler.jsonc intentionally omits them (see .dev.vars.example and
// docs/cloudflare/SECRETS.md); an empty/missing value must fail closed at
// request time, not silently proxy unauthenticated traffic.
export interface Env {
  // Placeholder base URL used only to build the outgoing Request's
  // path/query (new URL(env.ORIGIN_BASE_URL) in proxy.ts) - the actual
  // network target is the AMELU_ORIGIN container binding below, not this
  // hostname, so it no longer needs to resolve to anything real. Kept as a
  // required var (e.g. "http://origin.internal") to avoid touching
  // buildOriginRequest's URL construction. Locally, still the real Go
  // backend on localhost (no container/Tunnel in the loop for local dev).
  ORIGIN_BASE_URL: string;

  // Container binding for the Go origin (backend/Dockerfile), replacing
  // the old Tunnel hostname. See src/container.ts.
  AMELU_ORIGIN: DurableObjectNamespace<AmeluOriginContainer>;

  // Shared secret proving to the Go origin that a request genuinely came
  // through this Worker. Kept as defense in depth even though the
  // container is no longer reached over the public internet.
  ORIGIN_SHARED_SECRET: string;

  // Exact single origin allowed to make credentialed requests (CORS).
  ALLOWED_ORIGIN: string;

  // "development" | "preview" | "production" - informational only, used in
  // a couple of non-security decisions (e.g. verbosity of error bodies).
  ENVIRONMENT?: string;

  // Forwarded into the container's env by src/container.ts - see
  // backend/internal/config/config.go for what each one does.
  // Required by the Go origin at startup:
  DATABASE_URL: string;
  STALWART_BASE_URL: string;
  STALWART_ADMIN_USER: string;
  STALWART_ADMIN_PASSWORD: string;
  // Optional features - backend reports them unavailable at request time
  // if unset, does not fail startup:
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DOMAIN_CONNECT_PRIVATE_KEY?: string;
  DOMAIN_CONNECT_PUBKEY_DOMAIN?: string;
  DOMAIN_CONNECT_REDIRECT_URI?: string;
  ORDNARY_ISSUER?: string;
  ORDNARY_CLIENT_ID?: string;
  ORDNARY_CLIENT_SECRET?: string;
  ORDNARY_REDIRECT_URI?: string;
  ORDNARY_COOKIE_SECRET?: string;
  AMELU_ADMIN_SHARED_SECRET?: string;
  INTERNAL_JOBS_SHARED_SECRET?: string;
}
