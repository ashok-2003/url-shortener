# Workstream D (tests): progress log

- **Date:** 2026-11-06
- **Design:** `docs/superpowers/specs/2026-11-06-testing-design.md`
- **Plan:** `2026-11-06-testing.md` (part 1) and `2026-11-06-testing-e2e-bench.md` (part 2)

## Where things stand

On `test/contract-suite`, `pnpm test` reports **127 passed, 50 skipped**, and `pnpm typecheck` and `pnpm lint` are
clean. The branch sits directly on `main` `6ad0d0f`, so it fast-forwards into `main`. The harness alone (Task 1) is
already on `main` (`8d95703`).
`pnpm exec playwright test --list` lists 5 E2E tests. The skipped tests wait on code that isn't built yet. To see
what's left, run `grep -rn "PENDING(" tests`.

| Task | What                                                                   | State |
| ---- | ---------------------------------------------------------------------- | ----- |
| 1    | Workers harness: `@cloudflare/vitest-plugin`, migrations, `tests/support/` helpers | On `main`, and C builds on it |
| 2    | URL security and expiry boundary unit tests (107 cases against A's schema) | Pass |
| 3    | Own-host finding, slug and user-agent tests, on `test/handoff-c`       | C reports 24/24 pass on `feat/backend` |
| 4    | create/list/stats contract tests                                       | 2 live; the rest PENDING(C) |
| 5    | Redirect rules: 302/404/410, KV fill and TTL, no "not found" caching, click enqueue, Server-Timing, non-ASCII targets | 5 live; the rest PENDING(C) |
| 6    | Click pipeline (`recordClicks`), on `test/handoff-c`                   | C reports 5/5 pass against its code |
| 7    | Security: ownership, cursor leak, `ownerId` input ignored, no leaks on 500, no IP, referrer host only | PENDING(C) |
| 8    | Rate limit: 5 per minute, invalid input doesn't count, bursts, per owner, window reset | PENDING(E) |
| 9    | Playwright E2E at 390×844 (4 journeys and a rate-limit test), with isolated `.wrangler/e2e-state` | PENDING(B, C, E) |
| 10   | `pnpm bench`: create and redirect speed report (p50/p95/p99) against the owner's targets | Works; numbers once C lands |
| 11   | Collect, gate, merge                                                   | Collected and green; the merge into `main` and the final review are next |

**Branches:**
- `test/handoff-c` holds the tests that need C's modules: `14e9000` (own-host, slug, user-agent) and `e495949`
  (click pipeline). C merges them with its work.
- C has cherry-picked `14e9000` as `bf9ba1f`.

## Findings

1. **Trailing dot gets around the own-host check.** `https://sho.rt./x` passed `assertNotOwnHost`. **Fixed by C**
   (`c/task-0b`) and proven by `own-host.test.ts`. It isn't on `main` until `feat/backend` merges.
2. **Non-ASCII targets could crash the redirect.** Characters above U+00FF in `Location` make `Headers` throw. C now
   stores `new URL(url).href`, and the check is in the PENDING(C) block of `redirect.test.ts`.
3. **Note, not a test:** the request's own origin isn't checked when `PUBLIC_BASE_URL` differs from it. It's low
   risk, since it allows chaining two short links but not a loop.
4. **`@cloudflare/vitest-pool-workers` is deprecated**, renamed to `@cloudflare/vitest-plugin`. The harness uses the
   new name, but spec §12 still names the old package.

## Decisions made while building (to check)

- Implementers ran in parallel, each in its own git worktree, as the owner asked. The controller built Task 1 and
  reviewed each task's diff itself, for speed.
- `clearStorage()` deletes rows from every app table, so a rate-limiter table can't leak counts between tests.
- E2E uses its own state directory. `pnpm test:e2e` never touches a developer's `.wrangler/state`.
- The speed report never fails a run. It prints "meets" or "misses" beside the 20 ms and 50 ms targets.
- Tests that fail against built code wait on `test/handoff-c` and merge with their fix (owner: "hold back").

## Next steps

1. **Merge `test/contract-suite` into `main`.**
   - It wasn't merged at wrap-up because the main checkout had another session's uncommitted `package.json` edit (a
     `start` script).
   - Then run the final whole-branch review (most capable model), which hasn't run yet.
2. **When C's `feat/backend` merges:**
   - Remove the PENDING(C) markers in `links-contract`, `redirect` and `security`, then run them.
   - Report any failure to the owner, and hold it back. Never weaken an assertion.
   - Confirm that the 3-collisions test's zero-filled `getRandomValues` reaches `generateSlug`.
3. **When the owner's limiter (E) lands:**
   - Unskip `rate-limit.test.ts` and `tests/e2e/rate-limit.spec.ts`.
   - If the store expires on real time, change how the "after the window" test waits.
4. **When B's UI and C are in:** unskip the E2E journeys and run `pnpm test:e2e`. Fix selectors that drifted, using
   roles and labels only.
5. **Run `pnpm bench`** against `pnpm preview` once C emits `Server-Timing`, and hand the numbers to workstream F
   (README). The client-observed column is the one that shows what the fast path saves.
6. **Add contract tests for `analytics.overview`** (spec addendum 47aa513). C's stated rules:
   - 30-day breakdowns;
   - rolling `last24h` and `last7d`;
   - `expires_at == now` counts as expired;
   - `topLinks` ordered by clicks descending, then newest first.
7. **One exploratory security pass** with `curl` against `pnpm preview` after C lands (design §9). Turn findings into
   tests.
8. **Housekeeping:**
   - Add `test:e2e` and `bench` to the AGENTS.md commands table.
   - Update spec §12 to the new package name.
   - Remove the finished agent worktrees under `.claude/worktrees/agent-*` and `contract-suite`.
