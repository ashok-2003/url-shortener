import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:8787";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    // Phone-sized, touch-first (the phone is the primary target).
    ...devices["Desktop Chrome"],
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  },
  projects: [
    { name: "journeys", testIgnore: /rate-limit\.spec\.ts/ },
    // Runs last: it exhausts the owner's create budget.
    { name: "rate-limit", testMatch: /rate-limit\.spec\.ts/, dependencies: ["journeys"] },
  ],
  webServer: {
    // Fresh local D1/KV/Queue state on every run, then one seeded link.
    command:
      "rm -rf .wrangler/state && pnpm db:migrate && pnpm wrangler d1 execute url-shortner --local --file tests/e2e/seed.sql && pnpm preview",
    url: BASE_URL,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
