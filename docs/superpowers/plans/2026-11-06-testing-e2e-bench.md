# Contract Test Suite, Part 2: Hand-off to C, E2E, Speed Report (workstream D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** C's acceptance tests on `test/handoff-c` (Tasks 3 and 6), five phone-sized Playwright journeys, a speed report for create and redirect, and the final collection of
workstream D's work onto `main` and the `test/handoff-c` branch.

**Part 1:** `2026-11-06-testing.md` (Tasks 1, 2, 4, 5, 7 and 8). Task numbers are shared across both parts. Its header, **Global Constraints**, **Branches and parallel work**
and **Review Focus** apply here unchanged. Read them first. Task 1 (the harness) must be on `main` before these tasks
start. Tasks 3, 6, 9 and 10 can run in parallel with Part 1's Tasks 2, 4, 5, 7 and 8.

**Spec:** `docs/superpowers/specs/2026-11-06-testing-design.md` (§5.1–§5.4, §8, §9) and
`docs/superpowers/specs/2026-11-06-url-shortener-design.md`.

---

### Task 3: Handoff to C: own-host finding, slug and user-agent tests (branch `test/handoff-c`)

**Files:**
- Create: `tests/unit/own-host.test.ts`, `tests/unit/slug.test.ts`, `tests/unit/user-agent.test.ts`

**Interfaces:**
- Consumes:
  - `assertNotOwnHost(url, baseUrl)` (A);
  - `generateSlug(): string` from `@/server/links/slug` (C);
  - `parseUserAgent(ua: string | null): { deviceType; browser; os }` from `@/server/clicks/user-agent` (C);
  - `SLUG_PATTERN`.

- [ ] **Step 1: Write `own-host.test.ts`**

`baseUrl` is `https://sho.rt`.

```ts
it.each(["https://sho.rt/x", "https://SHO.RT/x", "https://sho.rt:443/x", "https://sho.rt./x", "https://sho.rt.:443/x"])(
  "rejects %s", (url) => expect(() => assertNotOwnHost(url, "https://sho.rt")).toThrow("That's already a short link from this app"));
it.each(["https://notsho.rt/x", "https://sho.rt.evil.com/x", "https://sho.rt:8443/x"])("allows %s", …);
```

- [ ] **Step 2: Write `slug.test.ts`**

```ts
it("10,000 slugs all match SLUG_PATTERN", …);
it("uses crypto.getRandomValues", …);  // vi.spyOn(crypto, "getRandomValues"); called at least once per slug
it("is unbiased (chi-square, 62 categories, df 61)", () => {
  // Replace getRandomValues with a seeded PRNG (mulberry32, seed 42) filling the given array, for determinism.
  // Count characters across 100,000 slugs (700,000 chars). Chi-square against a uniform 700,000/62.
  expect(chiSquare).toBeLessThan(101); // the 0.999 quantile for df 61; byte % 62 would score in the thousands
});
```

- [ ] **Step 3: Write `user-agent.test.ts`**

Assert `deviceType` only, because family names are the parser's choice. Use real, current UA strings.

| Case                                                       | `deviceType` |
| ---------------------------------------------------------- | ------------ |
| iPhone Safari, Android phone Chrome                        | `mobile`     |
| Android tablet Chrome (no "Mobile" token)                  | `tablet`     |
| Desktop Chrome on Windows, Firefox on Linux, Safari on Mac | `desktop`    |
| iPadOS Safari (reports a Mac UA; a known limit)            | `desktop`    |
| Googlebot, facebookexternalhit, Slackbot-LinkExpanding, Twitterbot | `bot` |
| `""` and `null`                                            | `unknown`, with `browser` and `os` both `null` |

- [ ] **Step 4: Check that the tests fail for the right reason**

Run: `pnpm test tests/unit/own-host.test.ts`
Expected: FAIL only on `https://sho.rt./x` and `https://sho.rt.:443/x`. That's the confirmed finding.

The slug and user-agent files fail on "module not found" until C creates the modules. That's expected on this branch.

- [ ] **Step 5: Commit on `test/handoff-c`** with `test: own-host finding, slug and user-agent acceptance tests for C`

---

### Task 6: Handoff to C: the click pipeline (branch `test/handoff-c`)

**Files:**
- Create: `tests/integration/click-pipeline.test.ts`

**Interfaces:**
- Consumes:
  - `recordClicks(db, events: ClickEvent[])` from `@/server/clicks/record`;
  - `ClickEvent = { id; linkId; clickedAt: number /* ms */; referrer; country; deviceType; browser; os }`, as agreed
    with C;
  - Task 1's `insertLink` and `testDb`.

- [ ] **Step 1: Write the tests**

```ts
it("a batch of 3 → clicks 3, three rows, last_click_at = newest, clicked_at kept", …);
it("the same batch twice counts once", …);              // clicks stays 3; click_events count 3
it("a partial redelivery counts only new events", …);   // [e1,e2] then [e2,e3] → clicks 3
it("one batch across two links updates both", …);
it("clicks always equals count(click_events)", …);      // after the four batches above, per link
```

- [ ] **Step 2: Commit on `test/handoff-c`** with `test: click pipeline acceptance tests for C`

---

### Task 9: E2E journeys (PENDING(B, C))

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/seed.sql`, `tests/e2e/journeys.spec.ts` and
  `tests/e2e/rate-limit.spec.ts`

**Interfaces:**
- Consumes these UI strings, from the frontend plan:
  - the field label "Link to shorten";
  - the expiry radios "Never", "1 hour", "24 hours", "7 days", "30 days" and "Custom";
  - the "Shorten" button;
  - the "Link created" result, the "Copy" button and the "Copied" toast;
  - the heading "Your links", and rows that are buttons;
  - the sheet's "All clicks" figure, opened by `?link=<slug>`.

- [ ] **Step 1: Write `playwright.config.ts`**

- `testDir: "tests/e2e"`, `workers: 1`, `fullyParallel: false`, and `baseURL: "http://localhost:8787"`.
- Chromium, with `viewport: { width: 390, height: 844 }`, `hasTouch: true` and `isMobile: true`.
- **Projects:** `journeys` (everything except `rate-limit.spec.ts`), and `rate-limit` with
  `dependencies: ["journeys"]`.
- **The web server:**
  - The command is `rm -rf .wrangler/state && pnpm db:migrate && pnpm wrangler d1 execute url-shortner --local --file tests/e2e/seed.sql && pnpm preview`.
  - `url: "http://localhost:8787"`, `timeout: 300_000` and `reuseExistingServer: false`, so every run starts fresh.

- [ ] **Step 2: Write `seed.sql`**

It inserts one link:
- slug `e2eSeed`, target `https://example.com/seeded`, owner `user_demo`;
- `created_at` is `CAST(unixepoch('subsec') * 1000 AS INTEGER)`, and `clicks` is 0.

- [ ] **Step 3: Write `journeys.spec.ts`** (inside `// PENDING(B, C): …` and `test.describe.skip`)

1. **Create and copy:**
   - Grant `clipboard-read` and `clipboard-write`.
   - Fill "Link to shorten" with `` `https://example.com/e2e-${Date.now()}` `` and pick "24 hours", then click
     "Shorten".
   - "Link created" is visible. After "Copy", the clipboard matches `^http://localhost:8787/[A-Za-z0-9]{7}$`.
   - The first list row contains that slug, the field is empty, and "24 hours" is still selected.
2. **Bad link:** with "http://example.com", clicking "Shorten" shows "Use an https:// link", and the row count is
   unchanged.
3. **Details and back:**
   - Tap the row for `e2eSeed`: a dialog is visible and the URL contains `link=e2eSeed`.
   - After `reload()`, the dialog is still visible.
   - After `goBack()`, the dialog is hidden and the URL has no `link=`.
4. **Visit and count:**
   - `request.get("/e2eSeed", { maxRedirects: 0 })` gives status 302 with `location` `https://example.com/seeded`.
   - `goto("/?link=e2eSeed")`. The "All clicks" figure becomes `1` within 20 s (`expect(...).toHaveText("1", { timeout: 20_000 })`,
     reloading between polls if the sheet doesn't refetch).

- [ ] **Step 4: Write `rate-limit.spec.ts`** (inside `// PENDING(E): …` and `test.describe.skip`)

- Create links until a `role="status"` alert appears, with at most 6 attempts.
- Its text matches `/Try again in (\d+) s/`. Within 2.5 s the number is smaller.
- "Shorten" stays disabled while it's visible.

- [ ] **Step 5: Check**

Run: `pnpm exec playwright test --list`
Expected: 5 tests listed (4 journeys and 1 rate-limit), with no errors.

- [ ] **Step 6: Commit** with `test: add phone-sized E2E journeys (pending B, C, E)`

---

### Task 10: Speed report

**Files:**
- Create: `scripts/bench/stats.mjs`, `scripts/bench/bench.mjs`, `tests/unit/bench-stats.test.ts`

**Interfaces:**
- Produces, in `stats.mjs`, plain JS with JSDoc types:
  - `percentile(sorted: number[], p: number): number`, by nearest rank (`sorted[ceil(p / 100 × n) − 1]`);
  - `summarize(samples: number[]): { n; p50; p95; p99; max }`, with `null` fields when `n` is 0;
  - `parseServerTiming(header: string | null): Record<string, number>`.

- [ ] **Step 1: Write `bench-stats.test.ts`**

```ts
it("nearest-rank percentiles", () => { const s = Array.from({ length: 100 }, (_, i) => i + 1); expect(percentile(s, 50)).toBe(50); expect(percentile(s, 95)).toBe(95); expect(percentile([7], 99)).toBe(7); });
it("summarize sorts and handles empty", () => { expect(summarize([3, 1, 2])).toEqual({ n: 3, p50: 2, p95: 3, p99: 3, max: 3 }); expect(summarize([]).p50).toBeNull(); });
it("parses Server-Timing", () => { expect(parseServerTiming("kv;dur=1.5, d1;dur=0, total;dur=3.25")).toEqual({ kv: 1.5, d1: 0, total: 3.25 }); expect(parseServerTiming(null)).toEqual({}); expect(parseServerTiming("kv;desc=x")).toEqual({}); });
```

- [ ] **Step 2: Run it to watch it fail, then implement `stats.mjs` and run it again**

Run: `pnpm test tests/unit/bench-stats.test.ts`
Expected: FAIL (module not found), then PASS.

- [ ] **Step 3: Write `bench.mjs`**

- **Flags:** `--base-url` (default `http://localhost:8787`), `--links` (5), `--requests` (500), `--concurrency` (10)
  and `--json`.
- **What it does:**
  1. Times `--links` creates through `POST <base>/api/trpc/links.create` with the body
     `{"url":"https://example.com/bench-<n>"}`.
  2. Sends one cold `GET /<slug>` per link.
  3. Sends `--requests` warm GETs, round-robin, `--concurrency` at a time.
  4. All GETs use `redirect: "manual"`.
- **The output table:**
  - Rows: create (client), redirect cold (client and server `total`), and redirect warm (client, server `total`,
    `kv` and `d1`).
  - Columns: n, p50, p95, p99 and max in ms, plus the count of non-302 responses.
- **Targets printed beside the results:**
  - "warm server total p95 ≤ 20 ms (KV hit)";
  - "all redirects server total p95 ≤ 50 ms".
  - Each says "meets" or "misses".
- **Exit codes:** exit 0 whatever the numbers, and exit 1 only if the server can't be reached. Note under the table:
  "Local Miniflare numbers. Point --base-url at a deployed Worker for production figures."

- [ ] **Step 4: Check**

Run `pnpm preview` in the background, then `node scripts/bench/bench.mjs --requests 50`.
Expected: the table prints and the exit code is 0. Before C lands, redirects show only non-302s (the stub answers
404), which is correct. Stop the server.

- [ ] **Step 5: Commit** with `test: add redirect and create speed report`

---

### Task 11: Collect, verify, hand off

- [ ] **Step 1: Merge Tasks 2, 4, 5, 7, 8, 9 and 10 into `test/contract-suite`** (off `main`), and add the
  `package.json` scripts `"test:e2e": "playwright test"` and `"bench": "node scripts/bench/bench.mjs"`.

- [ ] **Step 2: Run every gate**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all exit 0. `grep -rn "PENDING(" tests` lists the C, B and E blocks.

- [ ] **Step 3: Merge to `main`** with `merge: contract test suite (workstream D)`.

- [ ] **Step 4: Assemble `test/handoff-c`** (Tasks 3 and 6) on top of `main`. Send `backend-scale` the branch name,
  plus the rule: merge it with your work, and don't change assertions without the owner.

- [ ] **Step 5: Report to the owner**
  - The gate output.
  - The `PENDING` list.
  - Findings: the trailing dot (C), and the request-origin note.
  - The package rename (`@cloudflare/vitest-plugin`), and that AGENTS.md's command table still needs `test:e2e` and
    `bench`.
