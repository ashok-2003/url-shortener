import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:8787";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  // On CI: a stray test.only fails the run, and failures show inline on GitHub.
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Phone-sized, touch-first (the phone is the primary target).
    browserName: "chromium",
    userAgent: devices["Pixel 7"].userAgent,
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
    // Fresh state in a private directory, so a developer's own .wrangler/state is never touched.
    command: [
      "rm -rf .wrangler/e2e-state",
      "pnpm wrangler d1 migrations apply url-shortner --local --persist-to .wrangler/e2e-state",
      "pnpm wrangler d1 execute url-shortner --local --persist-to .wrangler/e2e-state --file tests/e2e/seed.sql",
      "pnpm exec opennextjs-cloudflare build",
      "pnpm exec opennextjs-cloudflare preview --persist-to .wrangler/e2e-state",
    ].join(" && "),
    url: BASE_URL,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
