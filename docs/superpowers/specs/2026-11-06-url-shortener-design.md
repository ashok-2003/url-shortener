# URL shortener: design

- **Date:** 2026-11-06
- **Status:** draft, waiting for the owner's approval
- **Source brief:** the full-stack take-home (`takshome.md`). The brief is the starting point, not the ceiling: the owner
  set no time limit. It grades judgment and explainability over completeness, and the video walkthrough is the main
  deliverable, so everything here must be something the owner can explain line by line.

Decisions are marked **(owner)** when the owner made them in conversation, and **(call)** when the designer made them
and the owner may still overturn them. Unmarked items are fixed by the brief.

---

## 1. Intent

A minimal, durable link shortener on the hiring team's production stack, written for Cloudflare Workers. "Durable"
means a small surface with clean seams, so features in section 14 can be added without rewriting what exists.

Two things matter most and shape the whole design:

1. **Redirects are fast**, and analytics never slow them down.
2. **Nothing relies on in-process memory between requests**, because Workers have none.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**

- Create a short link from an HTTPS URL, with an expiry the user picks (owner), through a tRPC mutation.
- List my links. Tapping one opens its details: clicks and how the link is performing (owner).
- `/{slug}` redirects to the target and counts the click.
- Record each click with time, referrer, country and device for charts (owner).
- Rate-limit creation to 5 links per minute per user. **Designed and built by the owner** (section 9).
- Mobile-first, clean, minimal UI with as few screens as possible (owner).
- Runnable locally with a short README; deployable to Workers.

**Non-goals (v1):** custom aliases; editing, deleting or disabling links; real auth; malware checks; stamping our name
as the referrer; QR codes; custom domains; bulk create or a public API; search; unique visitors; bot filtering; dark
mode. Section 14 lists them as add-ons.

**Anti-goals: failure even if it works**

- Any module-level mutable state relied on across requests (a `Map`, a counter, an in-memory cache or rate limiter).
- The redirect waiting on a database write.
- Hand-written REST endpoints for internal client-to-server calls. (The redirect is public and not an internal call.)
- A `301` redirect: browsers cache it, so repeat clicks never reach us and are never counted.
- A link that 404s right after it was created.
- A cluttered UI, or several pages where one works.
- Code that is clever rather than explainable.

## 3. Constraints

| Area            | Choice                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| Framework       | Next.js 16.4.5, App Router, React 19.3 (installed)                                           |
| Internal API    | tRPC 11.24 with `@trpc/tanstack-react-query`, TanStack Query 5.106, Zod 4.6 (installed)      |
| Database        | Cloudflare **D1** (SQLite) through **Drizzle ORM** (owner accepted D1, KV and Queues)        |
| Edge cache      | Cloudflare **Workers KV** for slug → link lookups. **No Redis** (section 6)                  |
| Click pipeline  | Cloudflare **Queues**, producer in the redirect, consumer in the same Worker                 |
| Runtime         | Cloudflare Workers through `@opennextjs/cloudflare` 1.20.16; Wrangler pinned to **4.157.0**  |
| User            | `userId = "user_demo"`, set once in the tRPC context, never read from input                  |
| UI              | Tailwind v4 + shadcn/ui, lucide icons                                                        |
| Tooling         | pnpm 11 (its minimum-release-age policy is why Wrangler is 4.157.0, not 4.158.0)             |
| Tests           | Vitest **4.x** (not 5: `@cloudflare/vitest-pool-workers` 0.23 requires `vitest ^4.1`)       |
| Code size       | Files under 500 lines                                                                        |

**Deployment: waiting on the owner.** Default: local-first. Everything runs under `pnpm preview` with local D1, KV
and Queues, and needs no Cloudflare account. `wrangler.jsonc` carries placeholder resource IDs, and provisioning is a
separate README step. On the Workers Free plan:

- Queues allow 10,000 operations a day. At about 3 per click (write, read, delete), that's about 3k clicks a day.
- KV allows 1,000 writes a day.
- The 100k-redirects-a-day target needs Workers Paid.

**(call)** Turn off `cacheComponents` and `partialPrefetching` in `next.config.ts` (create-next-app 16.4 turns them
on by default). Every page here is per-user and dynamic, so there is nothing to prerender, and it removes a feature
whose OpenNext support we would otherwise have to verify.

## 4. Architecture

```
Browser ──tRPC POST /api/trpc──┐            ┌── GET /{slug}
                               ▼            ▼
                ┌───────────── Cloudflare Worker ─────────────┐
                │ Next.js app (OpenNext)   redirect path       │
                │  pages, tRPC router      KV get ─miss→ D1    │
                │        │                 302 + waitUntil ──┐ │
                │        ▼                                   ▼ │
                │       D1 ◄──── queue consumer ◄──── Queue    │
                └──────────────────────────────────────────────┘
```

Bindings (names are **(call)**): `DB` (D1), `LINKS_CACHE` (KV), `CLICKS` (Queue producer, consumed by the same
Worker), and a dead-letter queue `clicks-dlq` with no consumer.

**Worker entry (call).** `worker.ts` is always Wrangler's `main`. It wraps `.open-next/worker.js`, following
OpenNext's "custom worker" how-to, and exports `fetch` and `queue` (the click consumer, section 7).

**Fast path (verify, then decide).** The redirect should not pay for the full Next.js pipeline. Hypothesis: `fetch`
answers `GET` and `HEAD` for `^/[A-Za-z0-9]{7}$` itself, before Next.js runs, and hands everything else to OpenNext.
`app/[slug]/route.ts` calls the same `resolveRedirect()`, so redirects also work under `next dev`. The builder measures
both paths under `pnpm preview` and records the numbers in the README. If the gain is negligible, delete the fast-path
branch. The file stays either way, because it exports `queue`.

## 5. Data model (Drizzle, SQLite on D1)

### `links`

| Column          | Type                              | Notes                                                       |
| --------------- | --------------------------------- | ----------------------------------------------------------- |
| `id`            | integer, primary key, autoincrement | Internal only, never in URLs. Doubles as the list cursor  |
| `slug`          | text, not null, **unique**        | 7 chars, base62, case-sensitive (SQLite `BINARY` collation) |
| `target_url`    | text, not null                    | HTTPS only, at most 2048 chars                              |
| `owner_id`      | text, not null                    | Always from the context                                     |
| `clicks`        | integer, not null, default 0      | Updated only by the queue consumer                          |
| `created_at`    | integer (ms), not null            |                                                             |
| `expires_at`    | integer (ms), nullable            | `null` means it never expires                               |
| `last_click_at` | integer (ms), nullable            | **(call)** shown in details                                 |

Index `(owner_id, id)` for the newest-first list.

### `click_events` (owner: store per-click data now, chart it later)

| Column        | Type                         | Notes                                                                           |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `id`          | text, primary key            | `clickId`, a UUID made in the redirect. It is the idempotency key (section 7)    |
| `link_id`     | integer, not null, FK → links |                                                                                 |
| `clicked_at`  | integer (ms), not null       | When the redirect happened, not when the consumer ran                           |
| `referrer`    | text, nullable               | **(call)** host only (`t.co`, `www.google.com`); `null` means direct. Full referrers can carry personal data in their query strings |
| `country`     | text, nullable               | ISO-3166 alpha-2 from `request.cf.country`                                      |
| `device_type` | text, not null               | `mobile`, `tablet`, `desktop`, `bot` or `unknown`                               |
| `browser`     | text, nullable               | Family name only                                                                |
| `os`          | text, nullable               | Family name only                                                                |
| `batch_id`    | text, not null               | The consumer run that inserted it (section 7)                                   |

Index `(link_id, clicked_at)`. **No IP addresses are stored.** Rows are kept indefinitely in v1; retention and
roll-ups are an add-on.

Migrations: `drizzle-kit generate` into `drizzle/`, applied with `wrangler d1 migrations apply` (locally with
`--local`).

## 6. Redirect: `/{slug}`

**Slug format.** 7 characters from `A-Z a-z 0-9`, made with `crypto.getRandomValues`, using rejection sampling (bytes
of 248 and above are discarded) so every character is equally likely. That gives 62⁷ ≈ 3.5 trillion slugs.
The unique index catches collisions, and creation retries with a fresh slug up to 3 times. Slugs are random, not
hashes or encoded ids. A hash can't be turned back into a URL, so a lookup is always needed anyway. Encoded sequential
ids let anyone walk through every link, and a hash of the URL would give two users the same slug for the same URL.

**Rule:** no top-level app route may be exactly 7 alphanumeric characters. Then the slug pattern can never collide
with `/`, `/api/...`, `/_next/...` or files in `public/`, and no reserved-word list is needed.

**Steps**

1. Path doesn't match `^/[A-Za-z0-9]{7}$` → not a slug, handled as a normal 404. No storage is touched.
2. KV `get("link:" + slug)` returns `{ id, targetUrl, expiresAt }` or nothing.
3. On a miss: D1 `SELECT id, target_url, expires_at FROM links WHERE slug = ?`. Nothing found → branded 404.
   Found → fill KV in `waitUntil` (don't block the response). **Never cache "not found"**: a KV miss always falls
   through to D1, so a newly created link always works, whatever KV has seen.
4. Expired (`now >= expiresAt`, using the Worker's clock) → `410` with the "This link has expired" page. The check runs
   on every request, cached or not, so a cached entry can't outlive its link.
5. Otherwise `302` with `Location: targetUrl` and `Cache-Control: private, no-store`, so neither browsers nor
   Cloudflare's cache serve a later click without counting it.
6. After the response, for `GET` only (`HEAD` isn't a click): `ctx.waitUntil(env.CLICKS.send(message))` (section 7).
7. Add a `Server-Timing` header (`kv`, `d1`, `total`) so latency can be shown in the walkthrough.

**Shared function (call).** `resolveRedirect({ request, env, waitUntil, cf })` returns a `Response`.

- `worker.ts` passes `request.cf`.
- The route handler passes `env`, `ctx.waitUntil` and `cf` from `getCloudflareContext()`.
- If `cf` is missing or mocked, as it can be under `next dev`, the country is recorded as `null`. It is never made up.

**KV entry lifetime (call).** `expirationTtl` = the smaller of 7 days and the seconds until the link expires, but at
least 60 (KV's minimum). Links can't be edited in v1, so a cached entry is never stale. If editing is added later, the
edit must also delete the KV key, and other locations may serve the old target for up to about 60 seconds.

**Consistency.** The link mapping is immediately consistent (D1 is the source of truth and KV is only a read-through
cache). Click counts and analytics are eventually consistent: a few seconds of lag, never lost. That trade is what
keeps writes off the redirect.

**Latency target (owner).** Measured as server time, from the request reaching the Worker to the `302` leaving it:
at most 20 ms on a KV hit, and p95 at most 50 ms. A first click at a location far from the D1 primary, with KV not yet
cached there, costs one D1 round trip and may go over 50 ms. D1 read replicas are the add-on for that.

## 7. Click pipeline

**Producer (in the redirect, after the response):** sends
`{ clickId, linkId, clickedAt, referrerHost, country, userAgent }`. The user agent is parsed later, so parsing costs
the redirect nothing.

**Consumer (`queue()` export of the Worker).** `max_batch_size` 100 and `max_batch_timeout` 5 s **(call)**. Default
retries, then `clicks-dlq`. For each batch:

1. Parse each user agent into `device_type`, `browser` and `os`. Library or small parser: builder's call; it must run
   on Workers.
2. Make one `batchId` (UUID) for this run.
3. In **one D1 `batch()`**, which D1 runs as a single transaction:
   - `INSERT ... ON CONFLICT(id) DO NOTHING` every event, tagged with `batchId`;
   - for each link in the batch, `UPDATE links SET clicks = clicks + (SELECT count(*) FROM click_events WHERE batch_id = ? AND link_id = ?), last_click_at = ...`.
4. Ack the batch.

Queues deliver at least once. Because a redelivered click's row already exists with an older `batchId`, it is ignored
and adds nothing to the new batch's count. A click is therefore counted exactly once, even when a batch is retried.

**Local development.** `next dev` doesn't run queue consumers. Requirement: under both `pnpm dev` and `pnpm preview`,
clicking a short link must increase its count within a few seconds. Suggested approach: one shared
`recordClicks(db, events)` used by the consumer, plus a dev-only fallback that calls it directly in `waitUntil` when
the queue binding is missing. The builder verifies what `getPlatformProxy` actually provides under `next dev`.

## 8. tRPC contract

Every procedure takes `ownerId` from the context. A link that belongs to someone else behaves exactly like a link that
doesn't exist (`NOT_FOUND`), so ownership is never revealed. `createContext({ ownerId = "user_demo" })` **(call)**:
the HTTP adapter and the RSC prefetch always use the default, and tests build callers with other owners. All dates cross the wire as ISO-8601 strings, so no
transformer (superjson) is needed. `shortUrl` = the request's origin + `/` + slug; the `PUBLIC_BASE_URL` variable
overrides the origin when set **(call)**.

### Shared types

```ts
type LinkSummary = {
  slug: string;
  shortUrl: string;
  targetUrl: string;
  clicks: number;
  createdAt: string;        // ISO
  expiresAt: string | null; // ISO; null = never
  isExpired: boolean;       // computed on the server when the response is made
};
```

### `links.create` (mutation)

Input:

```ts
{
  url: string;
  expiry:
    | { kind: "never" }
    | { kind: "preset"; preset: "1h" | "24h" | "7d" | "30d" }
    | { kind: "custom"; at: string /* ISO */ };
}
```

URL rules (one shared Zod schema, used by the form and the server):

- Trimmed. At most 2048 characters. Must parse with `new URL()`.
- Protocol must be `https:` (owner). `http://` is rejected with "Use an https:// link", never silently upgraded
  **(call)**.
- No username or password in the URL **(call)**: `https://paypal.com@evil.example` is a phishing trick.
- Host must not be our own host, which would create a redirect loop.

Expiry rules **(call)**: default `never`. Presets are computed **on the server** from its own clock. `custom` must be
at least 5 minutes ahead and at most 365 days ahead.

Output: `LinkSummary` (with `clicks: 0`, `isExpired: false`).

Errors: `BAD_REQUEST` for validation (field messages in `error.data.fieldErrors`); `TOO_MANY_REQUESTS` from the rate
limiter (section 9); `INTERNAL_SERVER_ERROR` if 3 slug attempts all collide.

### `links.list` (query)

Input: `{ cursor?: number; limit?: number /* 1–50, default 20 */ }`.
Output: `{ items: LinkSummary[]; nextCursor: number | null }`, newest first (`id` descending; the cursor is the last
`id` of the page).

### `links.stats` (query)

Input: `{ slug: string }`. Output **(call: the "performance" view)**:

```ts
{
  link: LinkSummary;
  lastClickAt: string | null;
  totals: { all: number; last24h: number; last7d: number };
  daily: { date: string /* YYYY-MM-DD, UTC */; clicks: number }[]; // last 30 days, days with no clicks filled with 0
  referrers: { host: string | null; clicks: number }[];            // top 5; null = direct
  countries: { country: string | null; clicks: number }[];         // top 5
  devices: { deviceType: string; clicks: number }[];
}
```

`totals.all` comes from `links.clicks`. Everything else comes from `click_events`. Both are written in the same
transaction, so they agree.

### Error shape

The tRPC `errorFormatter` adds two fields to `error.data`:

- `fieldErrors` from Zod (flattened);
- `retryAfterSeconds: number | null`, set only for `TOO_MANY_REQUESTS`.

The UI depends on both fields.

## 9. Rate limiting: owned by the owner

The owner designs and builds this. This spec fixes only the seam and the behaviour the UI and tests rely on.

- **Seam:** `links.create` is built as `procedure.input(createLinkInput).use(rateLimitCreate).mutation(...)`. The
  middleware comes **after** `.input()`, so invalid input is rejected before the limiter ever sees it. It is a full
  middleware: it can act before and after `await next()`, for example counting only when the result is ok. Until the
  owner builds it, it passes everything through.
- **The owner decides:** whether a create that fails after the limiter (3 collisions, or a D1 error) uses up a slot.
- **Required behaviour (from the brief and the owner):**
  - At most 5 successful creates per user per minute.
  - The 6th attempt within the minute fails with `TOO_MANY_REQUESTS` and `retryAfterSeconds`.
  - Invalid input never counts.
  - It must hold across Worker isolates and locations, so no in-memory counters.

## 10. Frontend

### Screens (owner: as few as possible)

- **`/`**, the only page: a header, the create form, and the list of my links.
- **Link details**: a sheet over `/`. It slides up from the bottom below 768px and from the right side at 768px and
  above **(call)**. The open link is in the URL as `?link=<slug>`, so the phone's back button closes it and reloading
  reopens it. The sheet fetches by slug, so a slug that isn't on the loaded pages still opens; no row highlight is
  needed. A slug that isn't the user's shows "This link doesn't exist."
- **Branded 404** (`not-found.tsx`) and **"This link has expired"** (410). Both offer a link to `/`.

### Server and Client Components

| Piece                | Kind   | Why                                                                                     |
| -------------------- | ------ | --------------------------------------------------------------------------------------- |
| `app/layout.tsx`, header | Server | Static                                                                              |
| `app/page.tsx`       | Server | Prefetches `links.list` by calling the router in-process (`createTRPCOptionsProxy` with the router and context; **not** an HTTP fetch to its own Worker), then wraps the children in `HydrationBoundary` |
| `CreateLinkForm`     | Client | Input state, the mutation, copy/share, the rate-limit countdown. Invalidates `links.list` on success |
| `LinkList`           | Client | `useSuspenseInfiniteQuery`: server-rendered HTML from the prefetch, then lives in the query cache so new links appear without a full server re-render. "Load more" button, no infinite scroll **(call)** |
| `LinkDetailSheet`    | Client | Opened by row taps; fetches `links.stats` when it opens                                 |
| Copy / Share buttons | Client | Clipboard API; Web Share API (the phone's share sheet) where it exists **(call)**       |

### Create form

- **URL field:** `type="url"`, `inputMode="url"`, autocapitalize and autocorrect off, 16px text (stops iOS from
  zooming in), a visible label.
- **Expiry:** a row of pill chips: Never (default), 1 hour, 24 hours, 7 days, 30 days, Custom. Custom shows a
  date-and-time input.
- **States:**
  - **Submitting:** a spinner replaces the label, the button keeps its width, and the button is disabled.
  - **Success:** a result block with the short URL in mono plus Copy and Share. The URL field clears; the expiry stays.
  - **Field errors:** shown under the field. Zod checks on the client first, and the server's `fieldErrors` use the
    same spot.
  - **Rate limited:** an inline alert, "You've made 5 links in the last minute. Try again in 42 s", with a live
    countdown from `retryAfterSeconds`. The button stays disabled until it reaches zero. If `retryAfterSeconds` is
    `null`, the alert says "Try again in a minute".
  - **Network or server error:** an inline message with Retry. The input is kept.

### List

Each row is one button with a hit area of at least 44px that opens the details.

- **Below 768px:** a divided list.
  - Line 1: the slug (mono) and the click count (mono, right-aligned).
  - Line 2: the target's host and path, truncated and muted, plus the created date and an expiry badge.
- **768px and above:** a table with Slug, Target, Clicks, Created and Expires. Numbers are right-aligned, mono and
  tabular.
- **Expiry display (call, no green):**
  - No badge while active: muted "Never expires" or "Expires 12 Nov".
  - **Amber** badge "Expires in 3 h" when less than 24 hours remain.
  - **Neutral** badge "Expired" once expired.
- **Empty:** "No links yet. Paste a URL above to make your first one."
- **Loading:** skeleton rows. **Error:** an inline message and Retry.

### Detail sheet

1. **Header:** the short URL (mono) with Copy and Share; the full target URL, wrapped and never truncated, with an
   open-in-new-tab link; Created, Expires and Last click.
2. **Numbers strip:** All clicks, Last 24 h, Last 7 days (large mono). One caption: "Counts update within a few
   seconds."
3. **Clicks per day, last 30 days:** one bar series in the action blue, axis labels in muted ink. It needs a text
   alternative (a visually hidden table, or `aria-label` with the totals). The builder follows the `dataviz` skill.
   Library: builder's call between shadcn's Chart (Recharts) and plain SVG; prefer whichever adds less to the bundle.
4. **Top referrers, top countries, devices:** ranked lists with mono counts and thin blue proportion bars. Country
   codes are shown as names with `Intl.DisplayNames`.
5. **States:**
   - **Zero clicks:** "No clicks yet. Share the link to start seeing numbers."
   - **Loading:** skeletons. **Error:** an inline message and Retry.
   - **`NOT_FOUND`:** "This link doesn't exist."

### Visual design (owner: travel-crm's DESIGN.md without green)

A trimmed token set from `../travel-crm/DESIGN.md`. Map it to Tailwind theme variables and shadcn CSS variables on
`:root`, never as colour literals in components. **Light mode only** in v1 **(call)**.

| Token             | Value                                   | Used for                                              |
| ----------------- | --------------------------------------- | ----------------------------------------------------- |
| canvas            | `#fffdf9`                               | Page background                                       |
| surface           | `#f5f4f0`                               | Sheets' inset areas, skeletons, row hover             |
| hairline          | `#e6e3dc`                               | Dividers, table and card borders (decorative only)    |
| input-border      | `#8a8a82`                               | Input outlines (3.4:1)                                |
| ink / ink-muted   | `#1a1a1a` / `#6b6b6b`                   | Text / secondary text                                 |
| action            | `#2563eb`, hover `#1d4ed8`, tint `#eef2ff` | **The only interactive colour**: buttons, links, focus ring, selected chip, chart bars |
| status red        | dot `#d92d20`, bg `#fdecea`, ink `#9b1c1c` | Errors only                                        |
| status amber      | dot `#c2680a`, bg `#fff3d6`, ink `#7a4100` | "Expires soon", rate-limit alert                   |
| status neutral    | dot `#6b6b6b`, bg `#ecebe6`, ink `#4a4a4a` | "Expired"                                          |

**Not used:** green, violet, forest, and every travel-specific token.

- **Type:** EB Garamond for the single page title (`h1`) only; Figtree for everything else; IBM Plex Mono with
  `tabular-nums` for slugs, short URLs, counts and dates in lists. Fonts load with `next/font`.
- **Shape:** buttons and chips are pills; inputs have a 6px radius and are 44px tall; badges have a 4px radius and are
  always a dot plus a word; cards and panels 10px, sheets 14px. Flat at rest; the overlay shadow is only for the sheet,
  toasts and popovers.
- **Layout:** designed at 360px first; side gutter 16px on phones, 24px from 768px, 32px from 1024px; one content
  column at most 768px wide **(call)**; touch targets at least 44px with at least 8px between them.
- **Motion:** ease-out, 120–200 ms (up to 240 ms for the sheet), opacity and transform only, behind `motion-safe:`.
- **Accessibility:** WCAG 2.2 AA; a visible 2px blue focus ring; full keyboard use; one `h1`; labelled icon buttons;
  toasts in a live region.

**Brand.** A working name, kept in one constant (`src/config/brand.ts`) and never hard-coded anywhere else **(call)**.

**Handoff.** The frontend workstream starts by writing a short `DESIGN.md` from this section with the `impeccable`
skill, then builds against it.

## 11. Project layout (call)

```
worker.ts                      custom Worker entry: redirect fast path + queue consumer (section 4)
wrangler.jsonc  open-next.config.ts  drizzle.config.ts
drizzle/                       migrations
src/
  app/  layout.tsx  page.tsx  not-found.tsx  globals.css
        [slug]/route.ts        redirect (dev, and fallback)
        api/trpc/[trpc]/route.ts
  components/ui/               shadcn
  config/brand.ts
  features/links/
    schema.ts                  shared Zod inputs (URL, expiry) and output types
    ui/                        create-link-form, link-list, link-detail-sheet, ...
  server/
    db/        schema.ts  client.ts
    trpc/      init.ts  context.ts  router.ts  error-format.ts
    links/     router.ts  service.ts  slug.ts  expiry.ts  rate-limit.ts (owner's seam)
    redirect/  resolve.ts      shared by the route handler and worker.ts
    clicks/    producer.ts  consumer.ts  record.ts  user-agent.ts
  trpc/        client.tsx (provider)  server.ts (RSC prefetch helpers)  query-client.ts
tests/
  unit/  integration/  e2e/
```

`server-only` is imported by everything under `src/server`, and `client-only` by browser-only modules.

## 12. Tests

- **Vitest 4.x.**
- **Unit tests** run in Node.
- **Integration tests** run inside `workerd` with `@cloudflare/vitest-pool-workers`, so D1, KV and Queues behave as
  they do in production.

| Layer       | What                                                                                                               | What it protects against |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Unit        | Slug: length, alphabet, uses `crypto.getRandomValues`, no modulo bias (chi-square on a large sample)               | Weak or biased slugs      |
| Unit        | URL schema: https only, rejects `http:`, `javascript:` and `data:`, credentials, our own host, more than 2048 chars; trims | Open redirects, XSS through `Location`, loops |
| Unit        | Expiry: preset maths on a fixed clock; custom bounds (5 min to 365 days)                                           | Off-by-one expiry         |
| Unit        | User-agent parser: mobile, tablet, desktop, bot; `stats` zero-fills days                                           | Wrong charts              |
| Integration | `create` → `list` → `stats` through `createCaller` against D1; newest first; cursor paging                         | Contract drift            |
| Integration | Ownership: another owner's slug gives `NOT_FOUND` from `stats`                                                     | Data leaks                |
| Integration | Redirect: `302` + `Location` + `no-store`; unknown → 404; expired → 410; a miss fills KV; "not found" is never cached; a fresh link works at once | The anti-goals in section 2 |
| Integration | The click is enqueued, and the response doesn't wait for it                                                        | Analytics slowing redirects |
| Integration | Consumer: the same batch delivered twice counts once; `clicks` matches the number of `click_events`                | Double counting           |
| Owner       | Rate limit: 5 succeed, the 6th fails with `retryAfterSeconds`, invalid input doesn't count, concurrent bursts can't exceed 5 | The brief's core requirement |
| E2E (nice to have) | Playwright at 390×844: create → list → details → visit the short URL → count goes up                        | The whole flow on a phone |

`pnpm test`, `pnpm lint` and `pnpm typecheck` must all pass before any work is called done.

## 13. Workstreams (for parallel agents)

| #   | Workstream                                                                                                   | Owner                | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------- | ---------- |
| A   | **Foundation:** pin Vitest 4.x; add `drizzle-orm`, `drizzle-kit`, `lucide-react` and `@cloudflare/vitest-pool-workers` (the newest versions pnpm's release-age policy accepts); `next.config` changes; `worker.ts` (pass-through `fetch`, stub `queue`); Wrangler bindings; OpenNext config; Drizzle schema and first migration; `resolveRedirect` signature; tRPC wiring with the contract and **stub procedures** that return typed fixtures; shared Zod schemas; shadcn init (Tailwind v4 is CSS-first, so there's no config file); design tokens; Vitest setup; scripts (`dev`, `preview`, `deploy`, `db:migrate`, `test`, `typecheck`, `lint`) | Subagent (Sonnet) | – |
| B   | **Frontend:** `DESIGN.md`, page, form, list, detail sheet, 404 and expired pages                             | Subagent + impeccable | A         |
| C   | **Backend:** real `create`, `list` and `stats`; slug; expiry; redirect (and the fast-path measurement); click producer and consumer | Subagent (Sonnet) | A |
| D   | **Tests:** section 12, written against the contract                                                          | Subagent (tester)    | A          |
| E   | **Rate limiting:** section 9                                                                                 | **Owner**            | A          |
| F   | **README:** setup, scripts, architecture summary, measured latency, the add-ons list                         | Subagent             | B, C       |

Once A has merged, B, C, D and E don't touch each other's files. The contract in section 8 is the only thing they
share. Any change to it goes through the owner. Each workstream works on its own branch, or its own git worktree, off
`main` once A has merged **(call)**.

## 14. Add-ons for later

- Malware and phishing check on create (Google Safe Browsing or Cloudflare's URL Scanner) (owner).
- Stamping our name as the source: `utm_source` added on redirect, with a per-link switch (owner).
- Custom aliases (needs character rules, a reserved list, and a "taken" error).
- Edit, delete or disable links (needs a KV delete; other locations may be stale for about 60 s).
- Bot and link-preview filtering; unique visitors.
- D1 read replicas for first clicks far from the primary; short negative caching for scanner traffic.
- `click_events` retention and daily roll-ups.
- Real auth (Clerk), QR codes, custom domains, bulk create, a public API, dark mode.

## 15. Left to the builder

- The user-agent parsing library.
- The chart library (within the rules in section 10).
- The test data factories.
- Exact copy beyond the strings given here.
- Exact skeleton shapes.
- Whether to keep the Worker fast path, decided by its measurement.
