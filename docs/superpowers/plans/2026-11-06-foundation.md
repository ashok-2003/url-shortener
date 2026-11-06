# Foundation (workstream A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the shared ground that the frontend (B), backend (C), tests (D) and the owner's rate limiter (E) all
build on:

- the Cloudflare runtime config;
- the D1 schema;
- the shared Zod contract;
- tRPC on the server, in the browser and in RSC prefetch, with **typed stub procedures**;
- the redirect seam.

**Architecture:** One Next.js 16 app, built for Workers with OpenNext.

- `worker.ts` is Wrangler's entry. It hands `fetch` to OpenNext and exports a stub `queue`.
- tRPC procedures are real routes with real validation and real errors, but return **stateless, deterministic
  fixtures** until workstream C replaces their bodies.
- Nothing keeps state in module scope.

**Tech Stack:** Next.js 16.4.5, React 19.3, tRPC 11.24, TanStack Query 5.106, Zod 4.6, Drizzle 0.45.4 on D1,
`@opennextjs/cloudflare` 1.20.16, Wrangler 4.157.0, Vitest 4.1.12, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-11-06-url-shortener-design.md`. Read sections 3–9 and 11 before starting.

## Global Constraints

- **Pinned versions:**
  - next 16.4.5, react 19.3.0
  - @trpc/server, @trpc/client and @trpc/tanstack-react-query 11.24.0
  - @tanstack/react-query 5.106.1, zod 4.6.7
  - @opennextjs/cloudflare 1.20.16, wrangler 4.157.0
  - vitest 4.1.12 (**not 5**), drizzle-orm 0.45.4, drizzle-kit 0.31.11
- **pnpm's release-age policy:** if pnpm 11 blocks a version, pick an older one. Never add
  `minimumReleaseAgeExclude`.
- **No module-level mutable state** anywhere under `src/server` or in `worker.ts`: no `let` caches, `Map`s or
  counters. (Workers share no memory between requests.)
- **Import guards:**
  - Every file under `src/server/**` and `src/trpc/server.tsx` starts with `import "server-only";`.
  - Browser-only modules start with `"use client"`.
- **`userId = "user_demo"`:** the constant `DEMO_USER_ID` in `src/server/trpc/context.ts`. It is never read from
  input.
- **Dates on the wire are ISO-8601 strings.** No superjson or any other transformer.
- **Size:** files under 500 lines.
- **Commits:** Conventional Commits. **No `Co-Authored-By` trailer.**
- **Commands you must not run:** never run `pnpm deploy` or any `--remote` Wrangler command. The project is
  local-first.
- **Done means** `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass.

## Review Focus

1. **`pnpm dev` with no Cloudflare account:** `next dev` must start and serve `/` using local bindings
   (`initOpenNextCloudflareForDev`). Covered by Task 1 Step 9.
2. **`pnpm preview` with the custom `worker.ts`:** Wrangler must bundle `worker.ts`, which imports the generated
   `.open-next/worker.js`. Covered by Task 1 Step 10.
3. **`server-only` under Vitest:** importing any `src/server` file in Node tests must not throw. Handled by the alias
   in Task 1 Step 6 and exercised by Task 4's tests.
4. **Error leakage:** production tRPC errors must not include stack traces, and unknown errors must not echo internal
   messages. Covered by Task 4 Step 1 (`INTERNAL_SERVER_ERROR` test).
5. **The own-host loop:** a target pointing at our own host must be rejected *before* the rate limiter. Covered by
   Task 4 Step 1 (own-host test).

---

### Task 1: Cloudflare runtime and tooling

**Files:**
- Modify: `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`
- Create: `open-next.config.ts`, `wrangler.jsonc`, `worker.ts`, `cloudflare-env.d.ts` (generated), `vitest.config.ts`,
  `tests/stubs/empty.ts`

**Interfaces:**
- **Produces:**
  - bindings `DB` (D1), `LINKS_CACHE` (KV), `CLICKS` (Queue producer), and the optional var `PUBLIC_BASE_URL`, all
    typed on the global `CloudflareEnv`;
  - the scripts below;
  - the Vitest project named `unit`.

- [ ] **Step 1: Swap in the pinned dev dependencies**

Run: `pnpm remove vitest && pnpm add -D vitest@4.1.12 drizzle-kit@0.31.11 && pnpm add drizzle-orm@0.45.4 lucide-react`
Expected: install succeeds and `pnpm-workspace.yaml` gains no `minimumReleaseAgeExclude` entries. If pnpm blocks
`lucide-react@latest`, pin the newest version it accepts.

- [ ] **Step 2: Configure Next.js for OpenNext**

In `next.config.ts`:
- delete `cacheComponents` and `partialPrefetching` (spec section 3);
- keep the existing `turbopack.rules` block;
- after the export, add `import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";` and call
  `initOpenNextCloudflareForDev();`.

Create `open-next.config.ts`:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
export default defineCloudflareConfig();
```

- [ ] **Step 3: Write `wrangler.jsonc`**

The IDs are placeholders. Local mode ignores them, and real provisioning is a README step.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "url-shortner",
  "main": "worker.ts",
  "compatibility_date": "2026-11-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "observability": { "enabled": true },
  "d1_databases": [
    { "binding": "DB", "database_name": "url-shortner", "database_id": "00000000-0000-4000-8000-000000000000", "migrations_dir": "drizzle" }
  ],
  "kv_namespaces": [{ "binding": "LINKS_CACHE", "id": "00000000000000000000000000000000" }],
  "queues": {
    "producers": [{ "binding": "CLICKS", "queue": "clicks" }],
    "consumers": [{ "queue": "clicks", "max_batch_size": 100, "max_batch_timeout": 5, "dead_letter_queue": "clicks-dlq" }]
  },
  "vars": { "PUBLIC_BASE_URL": "" }
}
```

- [ ] **Step 4: Write `worker.ts`** (repo root; spec section 4)

```ts
// @ts-ignore: generated by `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  // TEMP until workstream C: the click consumer (spec section 7).
  async queue(batch) {
    batch.ackAll();
  },
} satisfies ExportedHandler<CloudflareEnv>;
```

- [ ] **Step 5: Add the scripts to `package.json`**

```json
"dev": "next dev",
"build": "next build",
"preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
"deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
"cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts",
"db:generate": "drizzle-kit generate",
"db:migrate": "wrangler d1 migrations apply url-shortner --local",
"test": "vitest run",
"typecheck": "tsc --noEmit",
"lint": "eslint"
```

Remove `start`; it doesn't apply on Workers.

- [ ] **Step 6: Configure Vitest**

`vitest.config.ts`:
- **Aliases:** `@` → `./src`; `server-only` and `client-only` → `./tests/stubs/empty.ts` (an empty module,
  `export {};`).
- **Projects:** `test.projects: [{ extends: true, test: { name: "unit", environment: "node", include: ["tests/unit/**/*.test.ts"] } }]`.
- **`passWithNoTests: true`.**

Workstream D will append a `workers` project, so keep `projects` as an array.

- [ ] **Step 7: Generate the binding types and wire up TypeScript and ESLint**

Run: `pnpm cf-typegen`
Expected: `cloudflare-env.d.ts` exists and declares `interface CloudflareEnv` with `DB: D1Database`,
`LINKS_CACHE: KVNamespace`, `CLICKS: Queue` and `PUBLIC_BASE_URL: string`.

Then:
- `tsconfig.json`: add `"cloudflare-env.d.ts"` and `"worker.ts"` to `include`, and add `.open-next` and `.wrangler`
  to `exclude`.
- `eslint.config.mjs`: add `.open-next/**`, `.wrangler/**` and `cloudflare-env.d.ts` to the global ignores.

- [ ] **Step 8: Check the static gates**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all exit 0. Vitest prints "No test files found" and passes.

- [ ] **Step 9: Smoke-test `next dev`**

Run `pnpm dev` in the background, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`.
Expected: `200`. Stop the server.

- [ ] **Step 10: Smoke-test `pnpm preview` (the real Workers runtime)**

Run `pnpm preview` in the background and wait for "Ready on". Then
`curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/`.
Expected: `200`. Stop it. If Wrangler can't resolve `./.open-next/worker.js`, fix the import path; don't drop
`worker.ts`.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "chore: configure OpenNext, Wrangler bindings, worker entry and Vitest"
```

---

### Task 2: Database schema and first migration

**Files:**
- Create: `drizzle.config.ts`, `src/server/db/schema.ts`, `src/server/db/client.ts`, `drizzle/0000_*.sql` and
  `drizzle/meta/*` (generated)

**Interfaces:**
- **Produces:**
  - tables `links` and `clickEvents`;
  - `getDb(d1: D1Database): Db` and `type Db = ReturnType<typeof getDb>`;
  - `type LinkRow = typeof links.$inferSelect` and `type ClickEventRow = typeof clickEvents.$inferSelect`.

- [ ] **Step 1: Write `src/server/db/schema.ts`** with Drizzle's `sqlite-core`

Use the column names from spec section 5 (snake_case in SQL, camelCase in TypeScript). Timestamps are
`integer(..., { mode: "timestamp_ms" })`, and `createdAt` uses `.$defaultFn(() => new Date())`.

- **`links`:**
  - `id` integer primary key, autoincrement;
  - `slug` text, not null, `.unique()`;
  - `targetUrl` text, not null; `ownerId` text, not null;
  - `clicks` integer, not null, default 0;
  - `createdAt` not null; `expiresAt` nullable; `lastClickAt` nullable;
  - `index("links_owner_id_idx").on(t.ownerId, t.id)`.
- **`clickEvents`** (SQL name `click_events`):
  - `id` text primary key;
  - `linkId` integer, not null, `.references(() => links.id)`;
  - `clickedAt` not null;
  - `referrer`, `country`, `browser` and `os` nullable text; `deviceType` text, not null;
  - `batchId` text, not null;
  - `index("click_events_link_clicked_idx").on(t.linkId, t.clickedAt)` and
    `index("click_events_batch_link_idx").on(t.batchId, t.linkId)`. The second one serves the consumer's
    per-batch count in spec section 7.

- [ ] **Step 2: Write `src/server/db/client.ts` and `drizzle.config.ts`**

- `getDb` = `drizzle(d1, { schema })` from `drizzle-orm/d1`.
- `drizzle.config.ts`: `dialect: "sqlite"`, `schema: "./src/server/db/schema.ts"`, `out: "./drizzle"`.

- [ ] **Step 3: Generate the migration and apply it locally**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: `drizzle/0000_*.sql` is created and Wrangler reports the migration as applied to the local DB.

- [ ] **Step 4: Check the tables exist**

Run: `pnpm wrangler d1 execute url-shortner --local --command "SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"`
Expected: the output lists:
- `click_events`, `click_events_batch_link_idx` and `click_events_link_clicked_idx`;
- `links`, `links_owner_id_idx` and `links_slug_unique`.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck` (expected: exit 0).

```bash
git add -A && git commit -m "feat(db): add links and click_events schema with first D1 migration"
```

---

### Task 3: Shared link contract (Zod)

**Files:**
- Create: `src/features/links/schema.ts`
- Test: `tests/unit/links-schema.test.ts`

**Interfaces:**
- **Produces** (all exported from `@/features/links/schema`):
  - `SLUG_PATTERN = /^[A-Za-z0-9]{7}$/` and `MAX_URL_LENGTH = 2048`
  - `EXPIRY_PRESETS = ["1h", "24h", "7d", "30d"] as const`, `type ExpiryPreset`, and
    `PRESET_DURATION_MS: Record<ExpiryPreset, number>`
  - `CUSTOM_EXPIRY_MIN_MS = 5 * 60_000` and `CUSTOM_EXPIRY_MAX_MS = 365 * 86_400_000`
  - `urlSchema`, `expirySchema`, and `type ExpiryInput = z.infer<typeof expirySchema>`
  - `createLinkInput = z.object({ url: urlSchema, expiry: expirySchema.default({ kind: "never" }) })`
  - `listLinksInput = z.object({ cursor: z.number().int().positive().nullish(), limit: z.number().int().min(1).max(50).default(20) })`
  - `linkStatsInput = z.object({ slug: z.string().regex(SLUG_PATTERN) })`
  - the types `LinkSummary`, `ListLinksOutput = { items: LinkSummary[]; nextCursor: number | null }` and `LinkStats`,
    exactly as in spec section 8

- [ ] **Step 1: Write the failing tests**

Freeze the clock at `2026-11-06T12:00:00Z` with `vi.useFakeTimers()` and `vi.setSystemTime(...)`. Each test checks
that `safeParse` fails (or passes) and that `z.flattenError(result.error).fieldErrors` holds the exact message.

```ts
it.each([
  ["", "url", "Paste a link to shorten"],
  ["example.com", "url", "Enter a full link, starting with https://"],
  ["http://example.com", "url", "Use an https:// link"],
  ["javascript:alert(1)", "url", "Use an https:// link"],
  ["data:text/html,hi", "url", "Use an https:// link"],
  ["https://user:pass@example.com", "url", "Links with a username or password aren't allowed"],
  ["https://example.com/" + "a".repeat(2030), "url", "Links can be at most 2048 characters"],
])("rejects %j", (url, field, message) => { /* createLinkInput.safeParse({ url }) */ });

it("trims and accepts https", () => expect(createLinkInput.parse({ url: "  https://example.com/a?b=1  " }))
  .toEqual({ url: "https://example.com/a?b=1", expiry: { kind: "never" } }));

it.each([
  [{ kind: "custom", at: "2026-11-06T12:04:00Z" }, "Pick a time at least 5 minutes from now"],
  [{ kind: "custom", at: "2027-11-07T12:00:00Z" }, "Pick a date within a year"],
  [{ kind: "custom", at: "not a date" }, "Pick a valid date and time"],
  [{ kind: "preset", preset: "2h" }, undefined /* any failure */],
])("rejects expiry %j", ...);

it("accepts presets, never, and custom inside the window", ...); // "1h", "30d", never, custom at +1h
it("SLUG_PATTERN", () => { expect(SLUG_PATTERN.test("aZ09xYz")).toBe(true); expect(SLUG_PATTERN.test("api")).toBe(false); expect(SLUG_PATTERN.test("abc-123")).toBe(false); });
it("listLinksInput defaults limit to 20 and rejects 51", ...);
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `pnpm test tests/unit/links-schema.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement `src/features/links/schema.ts`**

- **`urlSchema`:** `z.string().trim()`, then a refinement that adds exactly **one** issue, checked in this order:
  1. empty;
  2. longer than 2048;
  3. `!URL.canParse`;
  4. protocol is not `https:`;
  5. a username or password is present.

  Use the messages from the tests.
- **Custom expiry:** `at` is checked against `Date.now()` at parse time, so the client checks against its clock and
  the server against its own (spec section 8).

- [ ] **Step 4: Run the tests to watch them pass**

Run: `pnpm test tests/unit/links-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/links/schema.ts tests/unit/links-schema.test.ts && git commit -m "feat(links): add shared Zod contract for create, list and stats"
```

---

### Task 4: tRPC server with stub procedures

**Files:**
- Create:
  - `src/server/trpc/errors.ts`, `src/server/trpc/error-format.ts`, `src/server/trpc/context.ts`,
    `src/server/trpc/init.ts`, `src/server/trpc/router.ts`
  - `src/server/links/guards.ts`, `src/server/links/rate-limit.ts`, `src/server/links/fixtures.ts`,
    `src/server/links/router.ts`
  - `src/app/api/trpc/[trpc]/route.ts`
- Test: `tests/unit/trpc-links.test.ts`

**Interfaces:**
- **Consumes:** Task 2 `Db`, `getDb`; Task 3 schemas and types.
- **Produces:**
  - `class RateLimitedError extends Error { constructor(readonly retryAfterSeconds: number) }`, the cause the
    owner's limiter throws;
  - `class InputFieldError extends Error { constructor(readonly field: "url" | "expiry", message: string) }`;
  - `formatError({ shape, error })`, which adds `data.fieldErrors: Record<string, string[]> | null` (from a `ZodError`
    via `z.flattenError(...).fieldErrors`, or from `InputFieldError`) and `data.retryAfterSeconds: number | null`
    (from a `RateLimitedError` cause);
  - `type Context = { ownerId: string; db: Db; baseUrl: string }` and `DEMO_USER_ID = "user_demo"`;
  - `createContext(opts: { db: Db; baseUrl: string; ownerId?: string }): Context`;
  - `resolveBaseUrl(origin: string, publicBaseUrl?: string): string`, which uses `publicBaseUrl` when it's a
    non-empty string and strips any trailing `/`;
  - `createRequestContext(req: Request): Context`, which takes `env` from `getCloudflareContext()`;
  - `createRscContext(): Promise<Context>`, which builds the origin from `headers()` (`x-forwarded-proto`, falling
    back to `http` for `localhost`/`127.0.0.1` and `https` otherwise, plus `host`);
  - `router`, `publicProcedure`, `createCallerFactory` (from `init.ts`);
  - `appRouter = router({ links: linksRouter })` and `type AppRouter`;
  - `assertNotOwnHost(url: string, baseUrl: string): void`, which throws `BAD_REQUEST` with cause
    `InputFieldError("url", "That's already a short link from this app")`;
  - `rateLimitCreate`, a pass-through `t.middleware` (the owner's seam, spec section 9).

- [ ] **Step 1: Write the failing tests**

Build `ctx = createContext({ db: {} as Db, baseUrl: "https://sho.rt" })`; the stubs never touch `db`. Test happy
paths through `createCallerFactory(appRouter)(ctx)`. Test errors **over HTTP**, through `fetchRequestHandler` with
`createContext: () => ctx`, so the formatted shape is what gets asserted.

```ts
it("create returns a LinkSummary", async () => {
  const link = await caller.links.create({ url: "https://example.com/x", expiry: { kind: "preset", preset: "1h" } });
  expect(link.slug).toMatch(SLUG_PATTERN);
  expect(link.shortUrl).toBe(`https://sho.rt/${link.slug}`);
  expect(link).toMatchObject({ targetUrl: "https://example.com/x", clicks: 0, isExpired: false });
  expect(Date.parse(link.expiresAt!) - Date.parse(link.createdAt)).toBe(3_600_000);
});
it("http:// → 400 with fieldErrors.url", async () => {
  const body = await post("links.create", { url: "http://example.com" });
  expect(body.error.data).toMatchObject({ code: "BAD_REQUEST", fieldErrors: { url: ["Use an https:// link"] }, retryAfterSeconds: null });
});
it("own host → 400 before the limiter", ...);          // url "https://sho.rt/abc1234" → fieldErrors.url ["That's already a short link from this app"]
it("ratelimit.test → 429 with retryAfterSeconds 42", ...); // status 429, data.code "TOO_MANY_REQUESTS", retryAfterSeconds 42
it("error.test → 500 without internals", ...);          // fixture throws plain Error("db exploded at 10.0.0.1"); body.error.message === "Something went wrong on our side."; no `stack` in data
it("list pages newest first", async () => {
  const p1 = await caller.links.list({});
  expect(p1.items).toHaveLength(20); expect(p1.items[0].slug).toBe("demo023"); expect(p1.nextCursor).toBe(4);
  const p2 = await caller.links.list({ cursor: 4 });
  expect(p2.items.map((l) => l.slug)).toEqual(["demo003", "demo002", "demo001"]); expect(p2.nextCursor).toBeNull();
});
it("stats: unknown slug → NOT_FOUND", ...);             // "zzzzzzz"
it("stats: demo023 totals agree", ...);                 // daily.length 30; totals.all === link.clicks; totals.last7d === sum of the last 7 daily
it("context defaults ownerId to user_demo", ...);
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `pnpm test tests/unit/trpc-links.test.ts`
Expected: FAIL, because the modules aren't found.

- [ ] **Step 3: Implement the errors, the formatter, the context and `init.ts`**

`initTRPC.context<Context>().create({ errorFormatter: formatError, isDev: false })`.

- `isDev: false` always, so stack traces never reach a client; use the server logs to debug.
- `formatError` replaces the message of every `INTERNAL_SERVER_ERROR` with "Something went wrong on our side." A plain
  `Error` thrown inside a procedure would otherwise echo its own message to the client.

- [ ] **Step 4: Implement the guard, the seam and the router**

The `links.create` chain must be exactly:

```ts
publicProcedure.input(createLinkInput)
  .use(({ ctx, input, next }) => { assertNotOwnHost(input.url, ctx.baseUrl); return next(); })
  .use(rateLimitCreate)
  .mutation(({ ctx, input }) => createFixtureLink(ctx, input))
```

`list` uses `listLinksInput`, and `stats` uses `linkStatsInput`.

- [ ] **Step 5: Implement `src/server/links/fixtures.ts`**

The file's first line is `// TEMP: stateless fixtures until workstream C replaces these bodies.` Every function is
pure: it takes `now: Date` and `baseUrl`, keeps nothing between calls, and uses no randomness except the created slug.

- **23 links**, `id` 1–23. `slug` = `demo` plus the id padded to 3 digits. `createdAt` = `now − (24 − id)` days.
- **Four links carry the UI's states:**

  | Slug      | State                                 |
  | --------- | ------------------------------------- |
  | `demo023` | never expires, `clicks` 1284          |
  | `demo022` | expires `now + 3 h`                   |
  | `demo021` | expired `now − 2 d`, `isExpired: true` |
  | `demo020` | `clicks` 0                            |

  The others never expire and have varied clicks.
- **Targets:** realistic `https://` URLs, including at least one longer than 120 characters.
- **`createFixtureLink`:**
  - target host `ratelimit.test` → `TOO_MANY_REQUESTS`, message "You've made 5 links in the last minute.", cause
    `new RateLimitedError(42)`;
  - target host `error.test` → throw a plain `new Error("db exploded at 10.0.0.1")`. This simulates an unexpected
    failure and proves the formatter hides it;
  - otherwise a new `LinkSummary` with a 7-character slug from `crypto.getRandomValues` and `expiresAt` from
    `PRESET_DURATION_MS` or `custom.at`.
- **`fixtureStats(slug)`:**
  - **30 UTC days**, oldest first, from a deterministic formula. All zeros for `demo020`.
  - **Referrers:** `t.co`, `www.google.com`, `null`, `news.ycombinator.com`, `www.linkedin.com`.
  - **Countries:** `IN`, `US`, `GB`, `DE`, `null`.
  - **Devices:** `mobile`, `desktop`, `tablet`.
  - **Totals:** `totals.all` = the link's `clicks`; `last24h` and `last7d` add up the matching days of `daily`.
  - **Unknown slug:** `NOT_FOUND`, "This link doesn't exist."

- [ ] **Step 6: Implement the HTTP route**

`src/app/api/trpc/[trpc]/route.ts` exports `GET` and `POST` handlers built on
`fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter, createContext: () => createRequestContext(req) })`.

- [ ] **Step 7: Run the tests to watch them pass**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 8: Check it end to end under `next dev`**

Run `pnpm dev` in the background, then:

`curl -s -X POST localhost:3000/api/trpc/links.create -H 'content-type: application/json' -d '{"url":"http://x.com"}'`

Expected: the JSON has `"fieldErrors":{"url":["Use an https:// link"]}`. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(api): add tRPC router with links contract, error shape and stub procedures"
```

---

### Task 5: tRPC in the browser and RSC prefetch

**Files:**
- Create: `src/trpc/query-client.ts`, `src/trpc/client.tsx`, `src/trpc/server.tsx`,
  `src/features/links/list-query.ts`, `src/app/_probe/link-probe.tsx` (TEMP)
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- **Consumes:** Task 4 `appRouter`, `AppRouter`, `createRscContext`.
- **Produces:**
  - `makeQueryClient(): QueryClient`. `staleTime` is 30 000, and `dehydrate.shouldDehydrateQuery` keeps the default
    plus `status === "pending"`.
  - In `client.tsx`: `useTRPC`, `TRPCProvider` (from `createTRPCContext<AppRouter>()`) and
    `TRPCReactProvider({ children })`. In the browser it creates one `QueryClient` and keeps it in a `useState`
    initialiser, with `httpBatchLink({ url: "/api/trpc" })`. It never creates a module-scope client on the server.
  - In `server.tsx`:
    - `trpc`, from `createTRPCOptionsProxy<AppRouter>({ ctx: createRscContext, router: appRouter, queryClient: getQueryClient })`;
    - `getQueryClient = cache(makeQueryClient)`;
    - `HydrateClient({ children })`;
    - `prefetch(options)`, which calls `prefetchInfiniteQuery` when `options.queryKey[1]?.type === "infinite"`, and
      `prefetchQuery` otherwise.
  - In `list-query.ts`: `LIST_PAGE_SIZE = 20` and
    `getNextPageParam = (last: ListLinksOutput) => last.nextCursor ?? undefined`.

- [ ] **Step 1: Implement the files above** following tRPC 11's "Set up with React Server Components" guide for
  `@trpc/tanstack-react-query`.

- [ ] **Step 2: Wire the TEMP probe**

- `layout.tsx` wraps `children` in `TRPCReactProvider`.
- `page.tsx` is a server component. It calls
  `prefetch(trpc.links.list.infiniteQueryOptions({ limit: LIST_PAGE_SIZE }, { getNextPageParam }))` and renders
  `<HydrateClient><LinkProbe /></HydrateClient>`.
- `LinkProbe` is a client component. It calls `useSuspenseInfiniteQuery` with the same options and renders each
  slug in an `<li>`, inside `<Suspense>`.

- [ ] **Step 3: Check that SSR carries prefetched data with no self-fetch**

Run `pnpm dev` in the background, then `curl -s localhost:3000/ | grep -c demo023`. Expected: ≥ 1.

Also check the dev server log: it must show no `POST /api/trpc` for that page load, which proves the server called
the router in-process. Stop the server.

- [ ] **Step 4: Run the gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all exit 0.

```bash
git add -A && git commit -m "feat(trpc): add React Query provider and RSC prefetch with hydration"
```

---

### Task 6: Redirect seam

**Files:**
- Create: `src/server/redirect/resolve.ts`, `src/features/status-pages/render.ts`, `src/app/[slug]/route.ts`
- Test: `tests/unit/redirect-seam.test.ts`

**Interfaces:**
- **Produces:**
  - `type StatusPageKind = "not-found" | "expired"`;
  - `renderStatusPage(kind: StatusPageKind, opts: { homeUrl: string }): string`. It returns a complete HTML document
    with the copy from the frontend plan; workstream B restyles it.
  - `resolveRedirect(args: { request: Request; env: CloudflareEnv; waitUntil: (p: Promise<unknown>) => void; cf?: { country?: string | null } | null }): Promise<Response>`.
    The **stub** always returns `404`, `content-type: text/html; charset=utf-8` and
    `cache-control: private, no-store`, with the body from `renderStatusPage("not-found", { homeUrl: origin + "/" })`.
    Workstream C replaces the body, not the signature.

- [ ] **Step 1: Write the failing tests**

- `resolveRedirect` for `https://sho.rt/abc1234` → status 404, HTML containing "This link doesn't exist", a link to
  `https://sho.rt/`, and `cache-control: private, no-store`.
- `renderStatusPage("expired", ...)` contains "This link has expired".

- [ ] **Step 2: Run the tests to watch them fail**

Run: `pnpm test tests/unit/redirect-seam.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/app/[slug]/route.ts` exports `GET` and `HEAD`. Both call
`resolveRedirect({ request, env, waitUntil: ctx.waitUntil.bind(ctx), cf })` using `getCloudflareContext()`. There's
no `page.tsx` under `[slug]`.

- [ ] **Step 4: Run the tests to watch them pass, then smoke-test**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

Then, with `pnpm dev` running, `curl -s -o /dev/null -w "%{http_code}" localhost:3000/abc1234` should print `404`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(redirect): add resolveRedirect seam, status page renderer and slug route"
```

---

## After this plan

Merge into `main`. Workstreams B (frontend plan), C (backend), D (tests) and E (the owner's rate limiter) then branch
from `main`, and each changes only the files its spec section 13 row names.
