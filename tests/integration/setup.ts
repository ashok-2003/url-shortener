import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll } from "vitest";
import { clearStorage } from "../support/db";

// Idempotent: migrations already applied are skipped.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

// Every test starts with no links, no clicks and an empty KV.
afterEach(async () => {
  await clearStorage();
});
