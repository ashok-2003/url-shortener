# URL shortener: testing design (workstream D)

- **Date:** 2026-11-06
- **Status:** draft, waiting for the owner's approval
- **Builds on:** `2026-11-06-url-shortener-design.md` (the spec) and `../plans/2026-11-06-foundation.md` (workstream A)

Same markers as the spec: **(owner)** is a decision the owner made in conversation, **(call)** is one the tester made
that the owner can overturn.

---

## 1. Intent

A test suite that tells us, at any moment, whether the shortener still does what the spec promised. The point is to
let features keep landing (spec §14) without silently breaking redirects, click counts, ownership or the rate limit.

The tests are written **from the spec, not from the code** (owner). That's what makes them independent: a builder's
misunderstanding can't leak into the test that's meant to catch it. They target the two things that only change with
the owner's approval, the tRPC contract (spec §8) and the redirect rules (spec §6), so they stay valid as code changes
underneath them.

The owner also wants numbers: how long it takes to **create** a link and how long a short link takes to **redirect**.

## 2. Goals, non-goals, anti-goals

**Goals**

- Cover every row of spec §12, plus the edge cases and attacks listed in §5 below.
- A security group that can be read and run on its own (`*security*` files).
- A speed report for create and redirect, compared against the owner's targets (spec §6: at most 20 ms server time on a
  KV hit, p95 at most 50 ms).
- A small E2E set: four phone-sized journeys plus one for the rate limit (owner: "some journeys only, not too heavy").
- Write now, in parallel with A, B and C; wire it up and fix small mismatches when the code lands (owner).

**Non-goals**

- Load or stress testing at the 100k-redirects-a-day scale. It needs Workers Paid and a deployed Worker.
- Measuring on a real Cloudflare deployment. That waits on the owner's deployment decision. The bench script accepts a
  base URL so it can be pointed at one later.
- Visual regression, cross-browser runs, or testing the look of the UI.
- Fixing bugs in other workstreams' code. The tester reports them (§9).

**Anti-goals: failure even if the tests pass**

- Tests that mirror the implementation instead of the spec, such as asserting internal call order or private helpers.
- Flaky tests: timing thresholds inside `pnpm test`, real network calls, or state shared between tests.
- Test-only switches in production code, such as a flag that turns the rate limiter off.
- Editing another workstream's files, or `src/server/links/rate-limit.ts` (the owner's).
- An E2E suite that takes minutes or breaks whenever a class name changes.

## 3. Constraints

- Everything in spec §3 and AGENTS.md applies: Vitest 4.x, pnpm, files under 500 lines, `@/` imports.
- **Unit tests** run in Node (A's `unit` Vitest project). **Integration tests** run inside `workerd` with
  `@cloudflare/vitest-pool-workers`, in a `workers` project that D appends to A's `vitest.config.ts` (the foundation
  plan's Task 1 Step 6 leaves room for it).
- **Workstream A merged into `main` at `5732906`.** The tests run against A's real code from the start. D adds the
  `workers` project to `vitest.config.ts` (the foundation plan reserves it for D). Apart from that, D edits no file
  that A, B, C or E owns.
- B, C and E aren't built yet. Their tests are written now from the spec and stay `PENDING` until each part lands
  (owner: "build from the spec, make small changes at integration").
- The rate limit is 5 creates a minute for the one fixed user (`user_demo`), and the HTTP adapter always uses that
  user. Anything that creates links over HTTP (E2E, the bench) has to live within that.
- Use the names the foundation plan fixes: `createLinkInput`, `urlSchema`, `expirySchema`, `listLinksInput`,
  `linkStatsInput`, `SLUG_PATTERN`, `MAX_URL_LENGTH`, the expiry constants, `createContext`, `createCallerFactory`,
  `appRouter`, `formatError`, `RateLimitedError`, `InputFieldError`, `assertNotOwnHost`, `getDb`, `resolveRedirect`,
  `renderStatusPage`.

## 4. How tests reach the code

Tests go through **public seams only**, so the code behind them can change freely:

| Seam                                                    | Defined by        | Used for                                     |
| ------------------------------------------------------- | ----------------- | -------------------------------------------- |
| Zod exports in `@/features/links/schema`                | Foundation Task 3 | URL and expiry rules                         |
| `createCallerFactory(appRouter)(createContext({ db, baseUrl, ownerId }))` | Foundation Task 4 | create, list, stats, ownership |
| `fetchRequestHandler` at `/api/trpc`                    | Foundation Task 4 | The error shape the UI sees over HTTP        |
| `resolveRedirect({ request, env, waitUntil, cf })`      | Foundation Task 6 | Every redirect rule                          |
| `generateSlug(): string` from `@/server/links/slug`     | **New (call)**    | Slug alphabet, length, bias                  |
| `parseUserAgent(ua: string \| null): { deviceType, browser, os }` from `@/server/clicks/user-agent` | **New (call)** | Device classification |
| `recordClicks(db, events)` from `@/server/clicks/record` | Spec §7          | Consumer counting and dedup                  |

The three rows marked **New** are internal function names that the spec doesn't fix. **C has agreed to export them
under these names.** The element type of `events` is C's:

```ts
type ClickEvent = {
  id: string; linkId: number; clickedAt: number /* ms */;
  referrer: string | null; // already a host
  country: string | null;
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  browser: string | null; os: string | null;
}; // no batchId: recordClicks makes one per run
```

`worker.ts` imports the OpenNext build output, so integration tests don't call `SELF.fetch` on it. They call
`resolveRedirect` and `recordClicks` directly with the `env` from `cloudflare:test`.

## 5. The suites

### 5.1 Unit (Node, in `pnpm test`)

New files only. A's `links-schema.test.ts`, `trpc-links.test.ts` and `redirect-seam.test.ts` stay A's.

- **Slug:** always 7 characters from `A–Z a–z 0–9`; uses `crypto.getRandomValues` (spy); a chi-square test over a
  large sample (at least 62,000 characters) shows no bias.
- **Expiry:** each preset on a frozen clock; custom at exactly 5 minutes ahead is accepted and 1 ms less is rejected;
  exactly 365 days ahead is accepted and 1 ms more is rejected; invalid ISO strings; the default is `never`.
- **User agent:** a table of real UA strings: iPhone Safari → mobile, Android phone Chrome → mobile, Android tablet →
  tablet, desktop Chrome/Firefox/Safari → desktop, Googlebot and link-preview bots → bot, empty or `null` → unknown.
  iPadOS Safari reports a Mac UA, so it's expected to come out as desktop. That's a known limit, recorded in the test.
- **URL security** (`url-security.test.ts`). Each case states the expected result:
  - Rejected: `http:`, `javascript:`, `data:`, `file:`, `ftp:`; `https://user:pass@x`, `https://user@x`,
    `https://paypal.com@evil.example`; 2049 characters after trimming; mixed-case schemes such as `JAVASCRIPT:` and
    `HtTp:`.
  - Accepted, with the stored value checked: leading or trailing spaces are trimmed; exactly 2048 characters is
    accepted.
  - Over 2048 only after normalizing (for example, a 2040-character URL with several `ü`, each of which becomes
    `%C3%BC`): `links.create` rejects it with `fieldErrors.url` `["Links can be at most 2048 characters"]`. C checks
    the length after `new URL(...).href` and throws `InputFieldError("url", ...)` (confirmed by C).
  - **Backslash and control-character tricks:** `https:\\evil.com`, `https:/\evil.com`, `https://exa<TAB>mple.com`,
    a newline inside the URL. The URL parser rewrites these. C stores and returns `targetUrl` as
    `new URL(trimmed).href` (C's decision), so through `links.create` the test checks
    `targetUrl === new URL(trimmed).href`. In §5.2 the redirect's `Location` equals that same string. What gets
    validated, stored and redirected to is then the same URL.
  - **Own host** through `assertNotOwnHost` with `baseUrl` `https://sho.rt`: `https://sho.rt/x`, `https://SHO.RT/x`,
    `https://sho.rt:443/x`, `https://sho.rt./x` and `https://sho.rt.:443/x` (trailing dot) are all rejected.
    `https://notsho.rt/x` and `https://sho.rt.evil.com/x` are allowed. **The trailing-dot cases fail against A's
    merged code today** (§9).

### 5.2 Integration (`workerd`, in `pnpm test`)

Each test file gets fresh D1 and KV (the pool's isolated storage). Migrations run in a setup file. Factories in
`tests/support/` insert links and click events directly, with explicit `ownerId`, `createdAt`, `expiresAt` and
`clicks`.

- **Create:** returns a `LinkSummary` with `clicks: 0`, `isExpired: false`, and `shortUrl` = base URL + `/` + slug;
  `PUBLIC_BASE_URL` overrides the origin; presets are computed on the server clock; a forced slug collision (spy on
  `getRandomValues`) retries, and three collisions give `INTERNAL_SERVER_ERROR` with the generic message.
- **List:** newest first; cursor paging across pages of 20 and 50; `limit` 0 and 51 are rejected; another owner's
  links never appear; `isExpired` is computed at response time.
- **Stats** (the semantics are C's calls, agreed with D):
  - `daily` is the 30 UTC days ending today, **today's partial day included**, oldest first, zero-filled. A click at
    23:59:59 UTC lands on the right day.
  - `totals.last24h` and `totals.last7d` are **rolling** windows (`clicked_at >= now − 24 h` and `now − 7 × 24 h`),
    not calendar days, so they won't equal sums of `daily`. The lower edge is inclusive: a click at exactly
    `now − 24 h` counts and 1 ms earlier doesn't.
  - `referrers`, `countries` and `devices` cover all time, like `totals.all`. `totals.all` equals `links.clicks`.
  - **Ordering** (agreed with C): clicks descending; then, **among equal clicks only**, `null` (direct or unknown)
    last; then the key ascending. Heavy direct traffic stays in the top 5. The order is fully deterministic, including
    a tie across fifth place, so rows don't jump when the sheet refetches.
  - C still has to get the owner's approval to write these rules into spec §8.
- **Redirect** (spec §6, one test per rule):
  - `302`, the right `Location`, and `Cache-Control: private, no-store`; never `301`.
  - Unknown slug → branded 404. A path that isn't slug-shaped (`/abc`, `/abc12345`, `/abc-123`) → 404 **without
    touching KV or D1**. The env is wrapped in a counting proxy to check this.
  - Slugs are case-sensitive: `AbC1234` and `abc1234` are different links.
  - Expired → 410 at exactly `now == expiresAt`. C never writes an expired link to KV, so the "still cached" case
    puts a stale entry into KV directly, then checks for 410.
  - A KV miss fills KV. The entry's expiration is the smaller of 7 days and the time left on the link, but never under
    60 s (read back through `LINKS_CACHE.list()`; C sets it with `expirationTtl`).
  - A D1 error during a redirect answers 503 with `Retry-After: 5` (owner-approved through C). **C's tests cover
    this, not D's.**
  - **"Not found" is never cached:** request an unknown slug, insert the link, request again → 302.
  - `HEAD` → 302 and **no** click is enqueued. `GET` → exactly one click enqueued.
  - **The redirect doesn't wait for the click:** a `CLICKS.send` that never resolves still gets a response back.
  - **`send()` really works inside `waitUntil` in `workerd`**, with the real `CLICKS` binding and not a fake.
    `docs/architecture/scaling.md` found no documentation that it's supported and asks this test to prove it.
  - The `Server-Timing` header always has `kv`, `d1` and `total`, and `d1;dur=0` when D1 wasn't queried (a KV hit).
  - **Non-ASCII and odd targets** (`https://example.com/ü`, `https://bücher.example/`, a URL with `%0d%0a`): the
    redirect still answers 302 with an ASCII `Location` that resolves to the same URL. Storing the raw string makes
    the `Headers` API throw on non-Latin-1 characters, which would turn the redirect into a 500.
- **Click pipeline:** `recordClicks` with the same batch twice counts once; a batch spanning two links updates both;
  `links.clicks` equals the count of `click_events` rows; `last_click_at` is the newest click; `clicked_at` is the
  redirect time, not the consumer time.
- **Security** (`security.test.ts`):
  - Another owner's slug → `NOT_FOUND` from `stats`, with the same message as a slug that doesn't exist.
  - Extra keys in the input are ignored: an `ownerId` sent in raw JSON over HTTP doesn't change who owns the link.
  - An unexpected error (D1 failure) → 500 with "Something went wrong on our side." and no stack or SQL.
  - **No IP stored:** a click with `CF-Connecting-IP` set leaves no trace of the IP in the queue message or in any
    `click_events` column.
  - **Referrer is a host only:** `https://t.co/abc?email=a@b.com` is stored as `t.co`.
  - **Not tested (call):** rejecting the request's own origin when `PUBLIC_BASE_URL` points somewhere else. Spec §8
    says "our own host", singular, and no seam can express this case: `Context` carries one `baseUrl`, and
    `createRequestContext` needs `getCloudflareContext()`, which the test pool doesn't provide. The risk is low. A
    true loop needs the new link's slug before it exists, so the realistic harm is chaining two short links. It goes
    to the owner as a note (§9), not as a test.
- **Rate limit** (`rate-limit.test.ts`), **PENDING(E)** (call):
  - 5 creates succeed and the 6th gets `TOO_MANY_REQUESTS` with `retryAfterSeconds` between 1 and 60.
  - Invalid input and own-host rejections don't count.
  - 10 concurrent creates → at most 5 succeed.
  - Another owner is unaffected.
  - After the window passes, creates work again.
  - The owner's open choice (whether a failed create uses a slot) is **not** tested.

### 5.3 Speed report (`pnpm bench`, not in `pnpm test`)

A plain script in `scripts/bench/`. It takes `--base-url`, which defaults to `pnpm preview`'s `http://localhost:8787`.

- **Redirect:** creates a few links, then sends N `GET /{slug}` requests (default 500, concurrency 10,
  `redirect: "manual"`). It reports cold (first hit, KV miss) and warm (KV hit) separately. For each it gives
  p50/p95/p99/max for both the client-observed time and the server time from `Server-Timing` (`total`, `kv`, `d1`).
- **Create:** times `links.create` over HTTP, 5 creates per run because of the rate limit (call). It reports each
  time and the median.
- **Output:** a table with the owner's targets printed beside the results, and an optional `--json`. **It never
  fails the run** (call): it's a report, not a gate.
- **Keep both columns.** `Server-Timing` is measured inside `resolveRedirect`, so it can't show what C's fast path
  saves by skipping Next.js. Only the client-observed column can.
- **What it can and can't show:** local numbers come from Miniflare's SQLite-backed KV and D1, so they're a sanity
  check and a way to compare versions (for example, C's fast path against the Next.js route). They aren't proof of the
  production target. That needs `--base-url` pointed at a deployed Worker.

### 5.4 E2E (Playwright, `pnpm test:e2e`, not in `pnpm test`)

Chromium only, a 390×844 viewport, against `pnpm preview` with fresh local state each run, run serially (calls).
Selectors use roles, labels and the exact copy from spec §10, so restyling doesn't break them. No test leaves the
machine. The redirect is checked with `request.get(url, { maxRedirects: 0 })` instead of visiting the real target.

1. **Create and copy:** paste an https link, pick 24 hours, submit → the short URL appears and Copy puts it on the
   clipboard; the new link is at the top of the list; the URL field clears and the expiry stays.
2. **Bad link:** type an `http://` link → "Use an https:// link" appears under the field and no row is added.
3. **Details and back:** tap a row → the sheet opens and the address has `?link=<slug>`; reload → still open; browser
   back → closed.
4. **Visit and count:** request the short URL → 302 to the target; reopen details → the count reaches 1 within a few
   seconds (polled, not slept).
5. **Rate limit**, PENDING(E): the 6th create shows "Try again in N s", and the button stays disabled until the
   countdown ends. It runs last, in its own Playwright project, after a state reset, because journeys 1–4 already
   use up creates within the same minute.

## 6. Keeping tests valid as features grow

- Tests for parts that aren't built yet use `describe.skip` with a comment `// PENDING(C): <what>` (or B or E). A
  grep for `PENDING(` lists what's left. Whoever builds a part removes its marker and makes those tests pass.
  **The `PENDING(C)` tests are C's acceptance tests** (agreed with C). C doesn't write a second copy of them.
- When a builder thinks a test is wrong, they raise it with the owner and the tester and don't change the assertions
  on their own. A test only changes when the spec changes.
- C adds tests only for behaviour this document doesn't cover, in its own folders `tests/unit/server/` and
  `tests/integration/server/`, which D never touches. They cover: KV read errors falling through to D1, D1 errors
  → 503, failed KV fills or `CLICKS.send` never surfacing, an all-redelivery batch changing nothing, and targets
  stored as `new URL(url).href`.
- New features (spec §14) bring their own tests. A feature that changes the contract updates the spec first, then the
  tests.
- A's `trpc-links.test.ts` asserts the stub fixture data (`demo023` and so on), so it **will break when C replaces
  the fixtures**. C deletes those fixture assertions together with `fixtures.ts`. D's integration tests take over
  covering the real behaviour.

## 7. Parallel split (call)

One branch, `test/contract-suite`, off `main`, in its own worktree. Four agents work at once, each on files nobody
else touches:

| Agent       | Writes                                                              |
| ----------- | ------------------------------------------------------------------- |
| unit        | `tests/unit/{slug,expiry,user-agent,url-security}.test.ts`         |
| integration | `tests/integration/**`, `tests/support/**`                          |
| e2e         | `tests/e2e/**`, `playwright.config.ts`                              |
| bench       | `scripts/bench/**`                                                  |

None of them edits `package.json`, `vitest.config.ts` or other shared config. Those edits happen once, at integration.
None of them touches `tests/unit/server/` or `tests/integration/server/` (C's).

## 8. Integration (after A merges, then as B, C and E land)

1. **Harness first, because C is waiting on it.** A has merged, so D lands a small change on `main` first: the
   `workers` Vitest project, a setup file that applies the D1 migrations, and `tests/support/` factories. D owns the
   `workers` project. If C is ready before the harness lands, C may add a minimal one and D adapts to it (agreed
   with C).
2. Rebase `test/contract-suite` onto `main`. Add `@playwright/test` and the scripts `test:e2e` and `bench`. Use the
   newest versions pnpm's release-age policy accepts, and check the installed pool-workers docs for its current
   config API.
3. Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Fix name and path mismatches. That's the "small changes" step.
4. Any test that fails against code that **is** built is a finding, not something to skip. It's **held back from
   `main`** (owner) and handled as §9 describes. Everything else merges with `pnpm test` green.
5. As each workstream lands, remove its `PENDING` markers and rerun.
6. Once C lands, run `pnpm bench` and hand the numbers to workstream F (README).

## 9. Bugs and vulnerabilities

- A failing test against built code is reported to the owner with the test name, the spec section it protects, and
  the actual result. The tester doesn't fix other workstreams' code.
- **Failing tests are held back from `main`** (owner), so `main`'s `pnpm test` stays green for every workstream:
  - Each one lives on a branch `test/findings` as its own commit, containing only that failing test.
  - The tester hands that commit to whoever fixes the bug. The fix and its test merge to `main` together, so the test
    proves the fix.
  - The test is never weakened to make it pass. If the fixer thinks the test is wrong, it goes to the owner.
- Once C lands, there's one exploratory pass with `curl` against `pnpm preview`, using the §5.1 and §5.2 attack cases
  plus anything the code suggests. New findings become tests.
- **Found so far:**
  - **Confirmed, A's code:** `assertNotOwnHost` compares `URL.host`, and `new URL("https://sho.rt./x").host` is
    `"sho.rt."`. The trailing dot gets around the check (checked in Node against the merged code). Uppercase,
    `:443`, backslashes and `%2E` are all caught. **C fixes it** (owner), and the test merges with the fix.
  - **Confirmed in Node, C is fixing it:** if the raw target is put in `Location`, any character above U+00FF (`€`,
    CJK, an IDN host such as `例え.jp`) makes `Headers` throw, which would turn the redirect into a 500.
    Latin-1 characters such as `ü` don't throw but go out as raw bytes. C's fix is to store `new URL(...).href`.
    The §5.2 test re-checks it in `workerd`.
  - **Note, not a test:** the request's own origin isn't checked when `PUBLIC_BASE_URL` differs from it (§5.2,
    low risk).
  - **To watch:** the expiry boundary (`now == expiresAt`) is easy to get off by one.

## 10. Calls for the owner to check

1. The speed numbers are a report, not a build gate.
2. Create timing is 5 samples per run over HTTP, because of the rate limit.
3. Speed is measured locally under `pnpm preview` for now. The script can point at a deployed Worker later.
4. The tester writes the rate-limit tests from spec §9, skipped until the owner's limiter exists.
5. C exports `generateSlug`, `parseUserAgent` and `recordClicks` under those names (agreed with C), and D's
   `PENDING(C)` tests are C's acceptance tests.
6. E2E is Chromium only, 390×844, against `pnpm preview`: four journeys plus one pending.
7. Four parallel agents split by layer, in one worktree, writing files nobody else touches.
8. The tester reports bugs and doesn't fix them in other workstreams' files. Failing tests wait on `test/findings`
   and merge with their fix (the owner chose "hold back").
9. The request-origin own-host case isn't tested (§5.2). It's a low-risk note for the owner.
10. C's decision, which the owner can still overturn: `targetUrl` is stored and returned as `new URL(input).href`, so
    the UI shows the encoded form (for example, a bare `https://example.com` gains a trailing `/`).

## 11. Left to the builder

- Factory shapes and helper names in `tests/support/`.
- The exact UA strings and the attack strings beyond those listed.
- How the bench script runs TypeScript (Node 22's built-in type stripping or `tsx`).
- How E2E resets local state between runs.
- How to fake the clock inside `workerd`, if `vi.setSystemTime` doesn't reach it.
