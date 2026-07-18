import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";
import type { Env } from "./types";

const workerEnv = env as unknown as Env;

// The Go origin (backend/Dockerfile), run as a Cloudflare Container bound
// to this Worker via the AMELU_ORIGIN Durable Object binding in
// wrangler.jsonc - replaces the old Tunnel+VPS path. Every env var the Go
// process reads (backend/internal/config/config.go) has to be forwarded
// explicitly here, since the container no longer has a VPS .env file to
// read from - Worker secrets (`wrangler secret put <NAME>`, see
// docs/cloudflare/SECRETS.md) are the new source of truth.
export class AmeluOriginContainer extends Container<Env> {
  defaultPort = 8081; // matches EXPOSE 8081 in backend/Dockerfile
  sleepAfter = "10m";

  envVars = {
    DATABASE_URL: workerEnv.DATABASE_URL,
    STALWART_BASE_URL: workerEnv.STALWART_BASE_URL,
    STALWART_ADMIN_USER: workerEnv.STALWART_ADMIN_USER,
    STALWART_ADMIN_PASSWORD: workerEnv.STALWART_ADMIN_PASSWORD,
    CORS_ORIGIN: workerEnv.ALLOWED_ORIGIN,
    ORIGIN_SHARED_SECRET: workerEnv.ORIGIN_SHARED_SECRET,
    RESEND_API_KEY: workerEnv.RESEND_API_KEY ?? "",
    STRIPE_SECRET_KEY: workerEnv.STRIPE_SECRET_KEY ?? "",
    STRIPE_WEBHOOK_SECRET: workerEnv.STRIPE_WEBHOOK_SECRET ?? "",
    DOMAIN_CONNECT_PRIVATE_KEY: workerEnv.DOMAIN_CONNECT_PRIVATE_KEY ?? "",
    DOMAIN_CONNECT_PUBKEY_DOMAIN: workerEnv.DOMAIN_CONNECT_PUBKEY_DOMAIN ?? "",
    DOMAIN_CONNECT_REDIRECT_URI: workerEnv.DOMAIN_CONNECT_REDIRECT_URI ?? "",
    ORDNARY_ISSUER: workerEnv.ORDNARY_ISSUER ?? "",
    ORDNARY_CLIENT_ID: workerEnv.ORDNARY_CLIENT_ID ?? "",
    ORDNARY_CLIENT_SECRET: workerEnv.ORDNARY_CLIENT_SECRET ?? "",
    ORDNARY_REDIRECT_URI: workerEnv.ORDNARY_REDIRECT_URI ?? "",
    ORDNARY_COOKIE_SECRET: workerEnv.ORDNARY_COOKIE_SECRET ?? "",
    AMELU_ADMIN_SHARED_SECRET: workerEnv.AMELU_ADMIN_SHARED_SECRET ?? "",
    INTERNAL_JOBS_SHARED_SECRET: workerEnv.INTERNAL_JOBS_SHARED_SECRET ?? "",
  };
}
