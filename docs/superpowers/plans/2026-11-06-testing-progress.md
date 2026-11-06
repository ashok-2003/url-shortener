# Workstream D (tests): progress log

- **Date:** 2026-11-06
- **Design:** `docs/superpowers/specs/2026-11-06-testing-design.md`
- **Plan:** `2026-11-06-testing.md` (part 1) and `2026-11-06-testing-e2e-bench.md` (part 2)

## Where things stand

**Updated 2026-11-06, after backend round 2 merged.** On `main` (`5c75bba`), `pnpm test` reports **334 passed, 0
skipped** (34 files), `pnpm lint` and `pnpm typecheck` are clean, and `pnpm test:e2e` passes **5 of 5** (run twice
locally: 48 s and 34 s, build included). No `PENDING(` marker is left in `tests/`.

C's merge removed the PENDING(C) and PENDING(E) markers and changed nothing else: every assertion in
`links-contract`, `redirect`, `security` and `rate-limit` is as written here, and the `test/handoff-c` files landed
byte for byte. The E2E specs were unskipped on `ci/checks` and passed with no selector changes.

**CI:** `.github/workflows/ci.yml` runs on every push (and by hand). One job runs lint, typecheck and Vitest; a second
runs the Playwright journeys at phone size and keeps traces when one fails. Nothing deploys: the project is
local-first (spec §3), and a deploy needs the owner's Cloudflare account.

| Task | What                                                                   | State |
| ---- | ---------------------------------------------------------------------- | ----- |
| 1    | Workers harness: `@cloudflare/vitest-plugin`, migrations, `tests/support/` helpers | On `main` |
| 2    | URL security and expiry boundary unit tests (107 cases against A's schema) | Pass on `main` |
| 3    | Own-host finding, slug and user-agent tests                            | Pass on `main` |
| 4    | create/list/stats contract tests                                       | Pass on `main` |
| 5    | Redirect rules: 302/404/410, KV fill and TTL, no "not found" caching, click enqueue, Server-Timing, non-ASCII targets | Pass on `main` |
| 6    | Click pipeline (`recordClicks`)                                        | Pass on `main` |
| 7    | Security: ownership, cursor leak, `ownerId` input ignored, no leaks on 500, no IP, referrer host only | Pass on `main` |
| 8    | Rate limit: 5 per minute, invalid input doesn't count, bursts, per owner, window reset | Pass on `main` |
| 9    | Playwright E2E at 390×844 (4 journeys and a rate-limit test), with isolated `.wrangler/e2e-state` | Pass, unskipped on `ci/checks` |
| 10   | `pnpm bench`: create and redirect speed report (p50/p95/p99) against the owner's targets | Works; not run against the merged backend yet |
| 11   | Collect, gate, merge                                                   | Merged; CI added on `ci/checks`. The final whole-branch review hasn't run |

**Branches:**
- `test/handoff-c` holds the tests that need C's modules: `14e9000` (own-host, slug, user-agent) and `e495949`
  (click pipeline). C merges them with its work.
- C has cherry-picked `14e9000` as `bf9ba1f`.

## Findings

1. **Trailing dot gets around the own-host check.** `https://sho.rt./x` passed `assertNotOwnHost`. **Fixed by C**,
   and `own-host.test.ts` proves it on `main`.
2. **Non-ASCII targets could crash the redirect.** Characters above U+00FF in `Location` make `Headers` throw. **Fixed
   by C**: it stores `new URL(url).href`, and `redirect.test.ts` proves it on `main`.
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

1. **Merge `ci/checks` into `main` and push it**, so CI runs on `main`. Then watch the first run on GitHub.
2. **Run the final whole-branch review** of the test suite (most capable model). It hasn't run yet.
3. **Run `pnpm bench`** against `pnpm preview` (the backend emits `Server-Timing` now), and hand the numbers to
   workstream F (README). The client-observed column is the one that shows what the fast path saves.
4. **Confirm that the 3-collisions test's zero-filled `getRandomValues` reaches `generateSlug`.** It passes, but it
   hasn't been checked that it passes for the right reason.
5. **`analytics.overview`:** C's `tests/integration/server/stats-rules.test.ts` covers all six stated rules. An
   independent contract test from D is optional.
6. **One exploratory security pass** with `curl` against `pnpm preview` (design §9). Turn findings into tests.
7. **Housekeeping:**
   - Update spec §12 to the new package name.
   - Remove the finished agent worktrees under `.claude/worktrees/agent-*` and `contract-suite`.
