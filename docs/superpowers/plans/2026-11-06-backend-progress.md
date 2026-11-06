# Backend (workstream C): progress log and handoff

- **Stopped:** 2026-11-06, about 17:15 IST, at the owner's request ("the time is over").
- **Plan:** `docs/superpowers/plans/2026-11-06-backend.md`
- **Spec:** `docs/superpowers/specs/2026-11-06-url-shortener-design.md`, plus the addendum
  `2026-11-06-navigation-and-analytics.md`
- **Integration branch:** `feat/backend` (worktree `.claude/worktrees/backend`). Not merged into `main`, and not pushed.

**How it was run:** subagent-driven development. Every task had a fresh implementer, an independent reviewer, and fix
rounds until the review was clean. Parallel tasks ran in separate worktrees, and only reviewed work was merged into
`feat/backend`.

## 1. Done, reviewed and on `feat/backend`

The gates on `feat/backend` (`bf9ba1f`) all pass: **184/184 tests** (`unit` and `workers` projects), `pnpm typecheck` 0,
`pnpm lint` 0.

| Task | What it delivers | Commits | Review |
| ---- | ---------------- | ------- | ------ |
| 0  | `src/server/config.ts`: frozen `REDIRECT` / `LINKS` constants, `readEnv` and `ConfigError` (fail loud on a missing binding or bad `PUBLIC_BASE_URL`). `src/server/log.ts`: one JSON line per event. tRPC `onError` logging. ESLint `no-console` for `src/server/**` and `worker.ts` | `81b8373` | Clean |
| 0b | Security fix: the own-host check no longer lets `https://sho.rt./x` (trailing dot) through. Ports compared | `a1a0300`, `0d3431d` | Clean after 1 fix round |
| 1  | `generateSlug()`: 7 base62 characters, unbiased rejection sampling. `resolveExpiresAt` and `isExpired` (`now >= expiresAt`). `SLUG_LENGTH` has one home in `schema.ts` | `2f99986` | Clean |
| 4a | `src/server/clicks/types.ts` (`ClickMessage`, `ClickEvent`, `DeviceType`). Hand-written `parseUserAgent` | `77ecae9` | Clean |
| 5a | `src/server/redirect/cache.ts`: `readCachedLink` (never throws; logs `kv.read_failed` / `kv.bad_value`), `fillCache` (logs `kv.fill_failed`), `cacheTtlSeconds`. `buildClickMessage` (referrer host only, no IP) | `fdfe557` | Clean |
| —  | `main` merged in (`ee2cf72`): D's test harness (`@cloudflare/vitest-plugin`), B's three tabs, the `analytics.overview` stub | `ee2cf72` | Gates green |
| —  | D's acceptance tests for own-host, slug (chi-square) and user-agent, cherry-picked unchanged. All pass | `bf9ba1f` | 24/24 |

Docs on `main` (`b38115b`) and on `feat/backend` (`bda889d`):
- `AGENTS.md` and `CLAUDE.md`;
- `docs/decisions/0001–0009`;
- `docs/architecture/{scaling,extending,flows}.md`;
- the backend plan, with Task H and Task 7 added;
- the spec's stats rules and `Retry-After: 5`.

## 2. Implemented, but NOT reviewed or merged

These are committed on their own branches and rebased onto `feat/backend`. Their reviews were stopped when work
stopped.

| Branch | Commits | State | To finish |
| ------ | ------- | ----- | --------- |
| `c/task-23` (Tasks 2 and 3) | `7febb7d` real create and list (normalized `href`, slug retries, cursor paging); `8ac88ec` real stats + `src/server/stats/aggregate.ts`; `50e896c` drops one B stub cross-check (Ruling R12) | All gates green after `50e896c` (the implementer's run; re-check) | Run the task review (spec + quality). Check that `links.list` works with `cursor` absent or null (B's Home uses `{ limit: 5 }`). Merge |
| `c/task-4b` (Task 4b) | `953f17e` `recordClicks` (one `db.batch`, exactly-once via `batchId` + `EXISTS` guard), consumer (malformed → `retry()` → DLQ), `worker.ts` `queue`, `wrangler.jsonc` (`max_concurrency` 2, `max_retries` 3, `server-only` alias) | 194/194, typecheck and lint 0. D's click-pipeline tests (`e495949`) pass 5/5 on behaviour | Add `export type { ClickEvent } from "./types"` to `src/server/clicks/record.ts` (D's test imports it there, so typecheck fails today). Cherry-pick `e495949`. Run the task review. Merge |

## 3. Not started

| Task | What | Blocked on |
| ---- | ---- | ---------- |
| 5b | The real `resolveRedirect`: KV → D1 → 302/404/410/**503**, `Server-Timing`, `sendClick` (dev inline via `recordClicks`), resilience tests | 4b merged. Merge `main` first: B's `"unavailable"` kind is on `main` at `219ce3f` |
| 6  | `worker.ts` fast path, measured with `pnpm bench`. Keep it only if warm p50 improves by at least 10% or 2 ms. Record the numbers in `scaling.md` and decision 0007 | 5b |
| 7  | Real `analytics.overview` (addendum §4); delete both fixtures files; retire B's stub tests | 3 merged |
| —  | Un-skip D's `PENDING(C)` contract tests once their suite is on `main` | D's merge |
| —  | Final whole-branch review on the most capable model, triaging the deferred minors in §5. Then merge `feat/backend` into `main`, or open a PR | Everything above |

**Checks waiting on D's contract suite:**
- does the 3-collisions create test's zero-filled `crypto.getRandomValues` spy reach `generateSlug` inside workerd?
- the redirect tests expect the message field `referrerHost`, which is already the name in use.

## 4. Rulings made during the run (each with its cost if wrong)

1. **R1:** while D's tests weren't on `main`, tasks wrote their own minimal tests in `tests/*/server/`. *Cost:* some
   overlap with D's tests.
2. **R2:** the trailing-dot fix went ahead with its own test; D's commit was cherry-picked later and passes.
   *Cost:* one duplicate test file.
3. **R3:** the user-agent parser got its own rule-table test before D's existed. *Cost:* overlap.
4. **R4:** tasks in one wave ran in parallel in separate worktrees (the owner asked for speed). *Cost:* merge
   conflicts if a task strayed. None happened.
5. **R5:** `SLUG_LENGTH = 7` lives once, in `schema.ts`, and `SLUG_PATTERN` is built from it. *Cost:* a small edit to
   a shared file, with the exports unchanged.
6. **R6:** tasks that don't import config started alongside Task 0. *Cost:* a rebase if wrong. It wasn't needed.
7. **R7:** C added a temporary integration harness (Task H) while D's wasn't on `main`. *Cost:* throwaway work. It
   was thrown away; see R11.
8. **R8:** `analytics.overview` became Task 7. Task 3 keeps `links/fixtures.ts` because B's stub reads it. *Cost:* one
   extra task.
9. **R9:** the harness uses `@cloudflare/vitest-plugin` 1.6.0, not the deprecated `vitest-pool-workers`, with D's
   layout. *Cost:* none.
10. **R10:** round 2 started before Task H's fix landed. *Cost:* one rebase per branch. Done.
11. **R11:** once D's harness reached `main`, Task H was superseded and never merged. *Cost:* Task H's effort.
12. **R12:** in B's `tests/unit/analytics-overview.test.ts`, only the `links.list` cross-check was dropped, because
    `list` is real now. B agreed. *Cost:* none, since Task 7 retires those tests anyway.
13. **R13:** stats runs **six** reads in one `db.batch`, not five. The plan miscounted. *Cost:* none.

Calls in the plan the owner can still overturn:
- `max_concurrency` 2 on the queue consumer;
- `Retry-After: 5`;
- the 10% / 2 ms rule for keeping the fast path;
- a malformed queue message is retried into the DLQ instead of acked.

## 5. What to improve next

**From the task reviews (deferred minors). The final review should triage these:**
- **`log.ts`:**
  - `JSON.stringify` can throw (on a BigInt or a circular object) inside the catch blocks of degraded paths. Add a
    guarded fallback line. *This matters most.*
  - Caller fields can overwrite `level`, `event` and `time`.
  - `Error.cause` is dropped.
- **tRPC `onError`:** logs 4xx errors (`BAD_REQUEST`, `TOO_MANY_REQUESTS`) at `error` level. Log them at `warn`.
- **`slug.ts`:** `BYTE_LIMIT = 248` is a literal. Derive it from `SLUG_ALPHABET.length` (the owner's no-hard-coding
  rule).
- **`cache.ts`:** check `expiresAt` with `Number.isFinite`. Add boundary TTL tests (exactly 60 s, exactly 7 days,
  already expired). Rename `cache-ttl.test.ts` to `cache.test.ts`.
- **Tests to add:**
  - user-agent rows not yet covered: tablet, kindle, silk, playbook, windows phone, cros, crios, fxios;
  - config: a `null` binding and a non-string `PUBLIC_BASE_URL`;
  - a slug refill past 16 bytes.
- **`readEnv`:** trim `PUBLIC_BASE_URL`.

**Product and scale** (details in `docs/architecture/scaling.md` and `extending.md`):
- **A better logging system** (owner): a request id (`cf-ray`) on every line; Logpush or a log drain; alerts on
  `click.send_failed`, `d1.read_failed` and DLQ depth. Only `src/server/log.ts` changes.
- **A replay path for `clicks-dlq`.** v1 has no consumer for it, and messages are dropped once retention runs out.
- **`analytics.overview` roll-ups:** a `daily_link_stats` table from a Cron Trigger, or a 60-second KV cache per owner
  as a first step.
- **Per-click events to Workers Analytics Engine** when D1 writes approach their ceiling. Keep the counters in D1.
- **D1 read replicas** for far-away first clicks. Start sessions with `first-primary`, so new links never 404.
- **The add-ons in spec §14:** edit, delete or disable (soft delete only, because queued clicks reference the link),
  custom aliases (need a reserved-word list), malware check, `utm_source` stamping, real auth, custom domains.

## 6. How to resume

```bash
cd .claude/worktrees/backend                 # feat/backend
git merge main                               # picks up B's "unavailable" kind and D's contract suite
# finish section 2: review c/task-23 and c/task-4b, then merge them
# then run section 3 in order: 5b → 6, and 7 (7 can run in parallel with 5b)
```

**Housekeeping:**
- Worktrees `backend-t0b`, `backend-t1`, `backend-t4a`, `backend-t5a` and `backend-tH` can be removed (their work is
  merged or superseded). Branch `c/task-H` can be deleted.
- Before measuring Task 6, check that port 8787 is free. A `pnpm preview` started by the 4b implementer couldn't be
  stopped from that session.
