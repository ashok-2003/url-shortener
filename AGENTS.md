# AGENTS.md

Read this first, whether you are a person or an AI agent. It covers how to work in this repo without breaking its
rules. It is short on purpose: the design spec holds the details, and this file points into it.

## What this is

A URL shortener built as a take-home. One Next.js 16 app runs on Cloudflare Workers through OpenNext. You paste an
HTTPS link, get a 7-character short link, and see how its clicks come in.

The take-home grades judgment and explainability, and the owner walks through the code on video. Write code the owner
can explain line by line. Plain beats clever.

**Status (2026-11-06):** the owner approved the spec. Workstream A (foundation) is on `main`. B (frontend), C
(backend) and D (tests) are in progress. Plans are in `docs/superpowers/plans/`.

## Source of truth

| What                                          | Where                                                       |
| --------------------------------------------- | ----------------------------------------------------------- |
| Design and every decision                     | `docs/superpowers/specs/2026-11-06-url-shortener-design.md` |
| Data model                                    | Spec §5                                                     |
| Redirect behaviour                            | Spec §6                                                     |
| Click pipeline                                | Spec §7                                                     |
| tRPC contract                                 | Spec §8                                                     |
| Project layout                                | Spec §11                                                    |
| Required tests                                | Spec §12                                                    |
| Who builds what                               | Spec §13                                                    |
| Future features                               | Spec §14                                                    |
| Why each backend choice was made              | `docs/decisions/`                                           |
| What breaks first under load, and what's next | `docs/architecture/scaling.md`                              |
| Where each future feature plugs in            | `docs/architecture/extending.md`                            |
| Next.js docs for the installed version        | `node_modules/next/dist/docs/`                              |

If this file and the spec disagree, the spec wins, and this file gets fixed. In the spec, **(owner)** marks a decision
the owner made and **(call)** marks one the designer made that the owner can still overturn. Don't reopen an (owner)
decision. If you think a (call) is wrong, raise it with the owner instead of quietly changing it.

**AI agents:** Next.js 16.4, React 19.3, tRPC 11, Zod 4 and current Wrangler may be newer than your training data.
Check the installed package's docs or types before using an API from memory.

## How it works

- `GET /{slug}` looks up the slug in KV, falls back to D1 on a miss, and answers `302` to the target. The click goes
  onto a Queue after the response is sent.
- A queue consumer in the same Worker writes `click_events` and adds to `links.clicks` in one D1 transaction. A click
  delivered twice is counted once.
- The UI talks to the server only through tRPC at `/api/trpc`. The redirect is the only hand-written HTTP route.
- D1 is the source of truth. KV is a read-through cache and nothing else.

Diagrams of every flow are in `docs/architecture/flows.md`. The reasoning is in spec §4, §6 and §7.

## Rules you must not break

These come from the spec's anti-goals (§2). Breaking one is a failure even if everything appears to work.

1. **No in-memory state across requests.** No module-level `Map`, counter, cache or rate limiter. Worker isolates come
   and go, so anything shared lives in D1, KV or a Queue.
2. **The redirect never waits on a write.** Click recording runs in `ctx.waitUntil(...)`, after the response.
3. **Redirects are `302` with `Cache-Control: private, no-store`.** Never `301`: browsers cache it, so later clicks
   never reach us and are never counted.
4. **Never cache "not found".** A KV miss always falls through to D1, so a link works the moment it is created.
5. **Check expiry on every request**, cached or not. An expired link answers `410`.
6. **The user comes from the tRPC context, never from input.** v1 uses the fixed `userId = "user_demo"`.
7. **Someone else's link looks like no link at all.** Return `NOT_FOUND`, never `FORBIDDEN`.
8. **No hand-written REST endpoints for internal calls.** Add a tRPC procedure.
9. **Targets are `https:` only**, with no username or password in the URL, and never our own host. One shared Zod
   schema validates on both the client and the server.
10. **No IP addresses are stored.** Referrers are stored as a host only.

## How we write code

The owner set these (decision 0009).

- **Fail loud, never fail silent.** A missing binding or a bad environment variable throws a `ConfigError` that says
  what is wrong and where to fix it. Never fall back to a default quietly. Every entry point calls `readEnv(env)` from
  `src/server/config.ts` first.
- **No hard-coded values.** Every tunable has one home:
  - contract values the browser also needs live in `src/features/links/schema.ts`;
  - server values live in `src/server/config.ts`;
  - queue settings and bindings live in `wrangler.jsonc`.

  Import a value; never retype it.
- **Log through `src/server/log.ts`** (`log.info`, `log.warn`, `log.error`). Server code never calls `console.*`
  directly, and ESLint enforces it. Never log IP addresses.
- **Seeing the logs:** warn and error lines go to stderr. `opennextjs-cloudflare preview` (`pnpm preview`) hides them, so
  use `pnpm start` (plain `wrangler dev`) to see them, and capture with `2>&1`.
- **No empty `catch`.** Where the visitor must still be served (a cache fill, a click send), catch, log with context,
  and carry on. Everywhere else, let the error propagate.

## Platform traps

These break code that looks right. The sources are in `docs/architecture/scaling.md`.

- **D1 allows at most 100 bound parameters per query.** Insert many rows as one statement each inside a single
  `db.batch()`, not as one multi-row insert.
- **D1 runs one query at a time.** Batch writes, and keep queue consumer concurrency low.
- **KV allows one write per second per key**, and a write can take 60 seconds or more to reach other locations. A
  failed cache fill must never fail the redirect: log a warning and move on.
- **Queues deliver at least once.** Every consumer must be safe to run twice on the same message.

## Where code goes

```
worker.ts               Worker entry: redirect fast path + queue consumer
drizzle/                migrations
src/app/                pages and route handlers
src/server/             server code; every file imports "server-only"
  db/                   Drizzle schema and client
  trpc/                 init, context, root router, error formatter
  links/                create, list, stats, slugs, expiry, rate limiter (rate-limiter.ts, rate-limit.ts)
  redirect/             resolveRedirect(), shared by the route handler and worker.ts
  clicks/               queue producer, consumer, recordClicks(), user-agent parsing
src/features/links/     shared Zod schemas and the link UI
src/trpc/               client provider and server prefetch helpers
tests/                  unit/  integration/  e2e/
```

The full tree is spec §11.

- Keep files under 500 lines.
- Import from `src/` with the `@/` alias.
- Browser-only modules import `client-only`.

## Who owns what

- **The create rate limiter is built (decision 0010).** It lives in `src/server/links/rate-limiter.ts` (the D1
  sliding window) and `src/server/links/rate-limit.ts` (the tRPC middleware). Its numbers are `RATE_LIMIT` in
  `src/server/config.ts`.
- **The tRPC contract (spec §8) changes only with the owner's approval.** It is the one thing parallel workstreams
  share.
- Once workstream A (foundation) has merged, workstreams B to E (spec §13) don't edit each other's files.

## Still open

Don't settle these on your own. They are waiting on the owner.

- Whether the `worker.ts` fast path stays. A latency measurement decides it (spec §4).
- When to move per-click events out of D1. `docs/architecture/scaling.md` has the signals to watch and the next step.

## Commands

| Command            | Does                                                                         |
| ------------------ | ---------------------------------------------------------------------------- |
| `pnpm install`     | Install. Use pnpm, not npm or yarn                                           |
| `pnpm dev`         | Next.js dev server with local bindings. No queue consumer runs here          |
| `pnpm preview`     | OpenNext build, then the real Workers runtime locally on port 8787, with D1, KV and Queues. Hides warn and error logs |
| `pnpm start`       | Plain `wrangler dev` on port 3005, serving the prebuilt `.open-next` (run an OpenNext build first). Shows every log level. The owner's demo server, so don't restart it without asking |
| `pnpm build`       | Next.js production build                                                     |
| `pnpm test`        | Vitest (`vitest.config.mts`)                                                 |
| `pnpm test:e2e`    | Playwright journeys at phone size. Builds with OpenNext and serves on port 8787 with its own fresh state in `.wrangler/e2e-state` |
| `pnpm bench`       | Speed report for create and redirect (p50/p95/p99) against a running server, by default `http://localhost:8787` |
| `pnpm typecheck`   | `next typegen`, then `tsc --noEmit`                                          |
| `pnpm lint`        | ESLint                                                                       |
| `pnpm db:generate` | Generate a Drizzle migration into `drizzle/` from `src/server/db/schema.ts`  |
| `pnpm db:migrate`  | Apply migrations to the **local** D1                                         |
| `pnpm cf-typegen`  | Regenerate `cloudflare-env.d.ts` after changing bindings in `wrangler.jsonc` |

**Never run `pnpm deploy` or any `--remote` Wrangler command.** The project is local-first (spec §3).

**Done means** `pnpm test`, `pnpm lint` and `pnpm typecheck` all pass. Report it with the output. If something failed
or was skipped, say so. CI (`.github/workflows/ci.yml`) runs all three, plus `pnpm test:e2e`, on every push.

## Version pins

Don't "upgrade" these.

- **Wrangler 4.157.0**, not the latest. pnpm's minimum-release-age policy blocks newer releases.
- **Vitest 4.1.12**, not 5. `@cloudflare/vitest-pool-workers` needs `vitest ^4.1`.
- **drizzle-orm 0.45.4** and **drizzle-kit 0.31.11.**

## Writing things down

- A decision that changes the design goes into the spec, marked (owner) or (call). A commit message or a chat alone
  isn't enough.
- Commit messages follow the existing history: `feat:`, `fix:`, `docs:`, `chore:`.
- Never commit `.env*`, `.dev.vars*` or any secret. Local secrets go in `.dev.vars`, which git ignores.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
