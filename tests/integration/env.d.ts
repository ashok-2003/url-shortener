/// <reference types="@cloudflare/vitest-plugin/types" />

// The `workers` Vitest project adds the D1 migrations as a binding so
// `tests/integration/setup.ts` can apply them (see vitest.config.mts).
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
