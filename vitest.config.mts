import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": r("./src"),
      "server-only": r("./tests/stubs/empty.ts"),
      "client-only": r("./tests/stubs/empty.ts"),
    },
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        // Integration tests run inside workerd with real D1, KV and Queue
        // bindings. Bindings are declared here rather than read from
        // wrangler.jsonc, whose `main` (worker.ts) imports the OpenNext build
        // output that doesn't exist in tests.
        extends: true,
        plugins: [
          cloudflareTest(async () => ({
            miniflare: {
              compatibilityDate: "2026-11-01",
              compatibilityFlags: ["nodejs_compat"],
              d1Databases: ["DB"],
              kvNamespaces: ["LINKS_CACHE"],
              queueProducers: { CLICKS: { queueName: "clicks" } },
              bindings: {
                PUBLIC_BASE_URL: "",
                TEST_MIGRATIONS: await readD1Migrations(r("./drizzle")),
              },
            },
          })),
        ],
        test: {
          name: "workers",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // One file at a time, so files never see each other's rows.
          fileParallelism: false,
        },
      },
    ],
  },
});
