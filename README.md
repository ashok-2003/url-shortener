# Snip: a link shortener for Cloudflare Workers

Paste an `https://` link, choose when it expires, and get a 7-character short link back. Then watch how it does:
clicks over time, referrers, countries and devices.

This is a take-home for a full-stack role. It's built on the team's stack: Next.js App Router, tRPC, and Drizzle on
SQL. It's written to run on **Cloudflare Workers**, where nothing is kept in memory between requests, and that
constraint drives most of the design.

> **Status (2026-11-06):**
>
> **Done:**
> - the foundation (runtime config, D1 schema, tRPC contract, redirect seam);
> - the full UI, as three tabs:
>   - **Home:** create a link, plus your 5 most recent;
>   - **My links:** every link, with paging and a detail sheet;
>   - **Analytics:** totals, a 30-day chart, top links, referrers, countries and devices;
> - a skippable `/sign-in` page and an account menu.
>
> - the real backend: D1 create, list and stats; the KV → D1 redirect; queued, idempotent click counting; SQL
>   analytics.
>
> **In progress:** the rate limiter (owner) and integration tests on `workerd`.

## Quick start

You need **Node 22+** and **pnpm 11**. You don't need a Cloudflare account: D1, KV and Queues all run locally.

```bash
pnpm install
pnpm db:migrate        # create the local D1 database (stored in .wrangler/)
pnpm dev               # Next.js dev server with local Cloudflare bindings → http://localhost:3000
```

If port 3000 is taken, use `pnpm dev -p 3005`.

To run the **production build** on the real Workers runtime (`workerd`), the way it runs in production:

```bash
pnpm exec opennextjs-cloudflare build   # production bundle in .open-next/
pnpm start                              # serves it with Wrangler → http://localhost:3005
```

Or build and serve in one step with `pnpm preview` (→ http://localhost:8787).

`next start` isn't used here. It runs a plain Node server without the Cloudflare bindings (D1, KV, Queues) that the
app reads through OpenNext.

## Scripts

| Script            | What it does                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`        | Next.js dev server, with D1, KV and Queue bindings through OpenNext          |
| `pnpm preview`    | OpenNext build, then `wrangler dev`: the actual Workers runtime              |
| `pnpm start`      | Serves the existing OpenNext build on the Workers runtime at port 3005       |
| `pnpm build`      | Next.js production build                                                     |
| `pnpm test`       | Vitest unit tests                                                            |
| `pnpm typecheck`  | Generates Next.js route types, then runs `tsc --noEmit`                      |
| `pnpm lint`       | ESLint                                                                       |
| `pnpm db:generate`| Generates a Drizzle migration from `src/server/db/schema.ts`                 |
| `pnpm db:migrate` | Applies migrations to the **local** D1 database                              |
| `pnpm cf-typegen` | Regenerates `cloudflare-env.d.ts` from `wrangler.jsonc`                      |
| `pnpm deploy`     | OpenNext build and deploy (needs a Cloudflare account and real resource IDs) |

## How it works

```
Browser ──tRPC /api/trpc──► Next.js on a Worker ──► D1 (links, click_events)
Browser ──GET /{slug}─────► redirect: KV → (miss) D1 → 302 → queue the click (after the response)
                            queue consumer ──► D1: insert click events + add to clicks, one transaction
```

- **Create, list and details** go through **tRPC** (`links.create`, `links.list`, `links.stats`). There are no
  hand-written REST endpoints for internal calls.
- **Redirect:** `/{slug}` checks the KV edge cache, falls back to D1, then answers with a `302`. It never answers
  with a `301`, because browsers cache those and later clicks would never be counted.
  - Unknown slug → `404`. Expired → `410`. Database unavailable → `503` with `Retry-After`.
- **Clicks never slow down the redirect.** They're queued in `ctx.waitUntil` after the response is sent. The
  consumer writes them in batches, and each click carries an id, so a redelivered message is counted only once.
- **Rate limit:** at most 5 links a minute per user. The 6th attempt gets `TOO_MANY_REQUESTS` with
  `retryAfterSeconds`, and the form counts down. It can't live in memory on Workers; the design is in progress.
- **The pages:** Home (`/`), My links (`/links`) and Analytics (`/analytics`) share one app shell.
  - On desktop the shell is a sidebar; on phones it's a bottom tab bar.
  - Each page is a Server Component that prefetches its data by calling the tRPC router in-process. It never fetches
    its own Worker over HTTP, and it hands the data to client components through React Query hydration.
  - The detail sheet (`?link=<slug>`) is mounted once in the shell, so a row on any tab opens it.

The full design, with every decision and its reasoning:
[`docs/superpowers/specs/2026-11-06-url-shortener-design.md`](docs/superpowers/specs/2026-11-06-url-shortener-design.md).

## Try it

1. On **Home**, shorten any `https://` link, then open the short link. You get a `302`.
2. Refresh **Home**, **My links** or **Analytics**: the click shows up within a few seconds. The detail sheet shows
   the referrer, country and device.
3. Shorten an `http://` link: you get "Use an https:// link", checked before anything is sent.
4. Open an unknown slug (`/zzzzzz9`) for the branded `404`. A link whose expiry has passed shows the `410` page.

The redirect's `Server-Timing` header shows whether the lookup hit KV or D1, and how long it took:
`curl -sI localhost:3005/<slug>`.

## Project layout

```
worker.ts               Worker entry: OpenNext fetch handler + queue consumer
wrangler.jsonc          D1, KV and Queue bindings (placeholder IDs; local by default)
drizzle/                SQL migrations
src/app/                pages and route handlers (/, /[slug], /api/trpc)
src/server/             server-only code: db, trpc, links, redirect, clicks
src/features/links/     shared Zod contract, formatting helpers, link UI
src/components/         design-system building blocks (shadcn/ui under ui/)
tests/unit/             Vitest
```

## Docs

- [Design spec](docs/superpowers/specs/2026-11-06-url-shortener-design.md): the source of truth.
- Implementation plans:
  [foundation](docs/superpowers/plans/2026-11-06-foundation.md) and
  [frontend](docs/superpowers/plans/2026-11-06-frontend.md).
- [`DESIGN.md`](DESIGN.md): design tokens and components. [`PRODUCT.md`](PRODUCT.md): who it's for and what it
  promises.
- [Navigation and analytics addendum](docs/superpowers/specs/2026-11-06-navigation-and-analytics.md): the three tabs and `analytics.overview`.
- `AGENTS.md`: the rules for anyone, person or AI, working in this repo.

## Deploying (optional)

The project is local-first. To deploy, run the steps below, then `pnpm cf-typegen && pnpm deploy`.

1. Create the D1 database, the KV namespace and the `clicks` and `clicks-dlq` queues with Wrangler.
2. Put their IDs into `wrangler.jsonc`.
3. Run `wrangler d1 migrations apply url-shortner --remote`.

Queues are on the Workers Free plan (10,000 operations a day, or about 3,000 clicks). Higher traffic needs Workers
Paid.

## What I'd improve next

**Finish what's in flight**

2. **Merge the owner's rate limiter.** The form's countdown is already wired to `retryAfterSeconds`.
3. **Analytics at scale.** `analytics.overview` runs GROUP BYs over raw `click_events`. Roll them up into a daily
   table once volume grows.
4. **Measure the redirect on a real deploy,** using its `Server-Timing` header. Keep the Worker fast path only if it
   beats the Next.js route.

**Frontend**

- **End-to-end tests** with Playwright at phone and desktop sizes: create → list → details → open the short link →
  the count goes up. Add visual regression tests for the three tabs and the sheet.
- **Optimistic create.** Put the new link at the top of "Recent links" right away, instead of waiting for the refetch.
- **Analytics controls:**
  - a 7/30/90-day range;
  - day boundaries in the viewer's time zone (today they're UTC days);
  - comparing links.
- **Accessibility:** an axe and screen-reader pass, plus unique chart ids when the sheet opens over Analytics.
- **Expiry before hydration.** The countdown text ("Expires in 3 h") appears only after hydration; before that it
  reads as a plain date. Rendering it on the server with the request time would remove the switch.
- **A QR code** in the detail sheet; dark mode.

**Product and platform**

- **Real auth (Clerk).** It replaces `user_demo`, makes the sign-in page real, and gives Log out something to do.
- **Link safety:**
  - malware and phishing checks on create (Safe Browsing or Cloudflare URL Scanner);
  - bot and link-preview filtering in analytics.
- **More link features:**
  - custom aliases;
  - editing, disabling and deleting links (each needs a KV delete);
  - `utm_source` stamping on redirect;
  - custom domains; bulk create; a public API.
- **Scale:** D1 read replicas for first clicks far from the primary; short negative caching for scanner traffic; a
  retention policy for `click_events`.

See spec §14 and `docs/superpowers/specs/2026-11-06-navigation-and-analytics.md`.
