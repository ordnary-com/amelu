import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ORIGIN_BASE_URL: "https://origin.test.invalid",
          INTERNAL_JOBS_SHARED_SECRET: "test-shared-secret",
          ENVIRONMENT: "test",
        },
      },
    }),
  ],
});
