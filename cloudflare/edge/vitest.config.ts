import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ORIGIN_BASE_URL: "https://origin.test.invalid",
          ORIGIN_SHARED_SECRET: "test-shared-secret",
          ALLOWED_ORIGIN: "https://app.amelu.org",
          ENVIRONMENT: "test",
        },
      },
    }),
  ],
});
