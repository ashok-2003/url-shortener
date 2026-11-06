# Navigation and analytics: design addendum

- **Date:** 2026-11-06
- **Status:** approved by the owner
- **Extends:** `2026-11-06-url-shortener-design.md`. This file takes precedence over its section 10 "Screens" where
  they differ.

Marks follow the main spec: **(owner)** means the owner decided, **(call)** means the designer decided and the owner
may overturn it.

## 1. What changed (owner)

The single page becomes **three tabs** in an app shell:

| Tab | Route | Contents |
| --- | --- | --- |
| **Home** | `/` | The create form, then **the 5 most recent links**, then a **"View all links"** button that goes to My links |
| **My links** | `/links` | Every link, newest first, with "Load more". This is today's list |
| **Analytics** | `/analytics` | Totals and charts across **all** of the user's links |

The link detail sheet (`?link=<slug>`) works on every tab. Tapping a row on Home or My links opens it over the
current tab.

Neither `links` (5 characters) nor `analytics` (9) is 7 alphanumeric characters, so neither can clash with the slug
pattern, and the redirect's fast path never matches them. Static routes also win over `app/[slug]` in Next.js.

## 2. Shell (call)

- **At 768px and above:** a 232px left sidebar on the surface tone, with the brand at the top and the three items.
  - The active item has the blue tint and blue ink, and no side stripe (DESIGN.md).
  - `user_demo` sits in mono at the bottom of the sidebar.
- **Below 768px:** a sidebar doesn't fit on a phone, so the same three items become a **bottom tab bar**.
  - 56px tall, plus `env(safe-area-inset-bottom)`.
  - Icon and label are always visible, the active item is blue, and each target is at least 44px.
  - The brand sits in a slim top bar.
- **Icons** (lucide): `House`, `Link2` and `ChartColumn`.
- **Each tab has its own `h1`** in the display font: "Home", "My links", "Analytics". The brand is no longer the
  `h1`.
- **Layout:** a route group `src/app/(app)/` holds the shell `layout.tsx`. That layout renders the sidebar or tab
  bar, `<main>`, and `<Suspense><LinkDetailSheet/></Suspense>` once for all three tabs.
- **Active tab:** comes from `usePathname()`. Nav items are Next `<Link>`s with `aria-current="page"` on the active
  one.

## 3. Home's recent links

- **The query:** `links.list({ limit: 5 })` as a **plain** query, not an infinite one. The Home page prefetches it on
  the server in-process, the same way the list is prefetched today.
- **Rows:** the existing `LinkRow`, under the section title "Recent links".
- **The button:** a secondary pill "View all links", linking to `/links`. It shows only when the user has at least one
  link.
- **Empty:** "No links yet. Paste a URL above to make your first one."
- **After a create:** invalidate `trpc.links.list.pathKey()`. That covers both the Home query and the My links
  infinite query.

## 4. `analytics.overview` (new tRPC query)

The data is real once the backend lands. Until then, the same kind of **stateless stub** as the other procedures
serves it (owner: "hardcode … only if you can't find the real data now"). Because the stub sits behind the real
contract, the page doesn't change when workstream C fills the body in.

Input: none. The window is fixed at the last 30 UTC days.

```ts
type AnalyticsOverview = {
  totals: {
    clicks: number;      // all time, across the user's links (sum of links.clicks)
    last24h: number;
    last7d: number;
    links: number;       // links the user has created
    activeLinks: number; // not expired
  };
  daily: { date: string /* YYYY-MM-DD, UTC */; clicks: number }[]; // 30 days, oldest first, zero-filled
  topLinks: { slug: string; shortUrl: string; targetUrl: string; clicks: number }[]; // top 5 by all-time clicks
  referrers: { host: string | null; clicks: number }[]; // top 5 within the 30 days
  countries: { country: string | null; clicks: number }[]; // top 5 within the 30 days
  devices: { deviceType: string; clicks: number }[]; // within the 30 days
};
```

- **The stub (call):** derives the numbers from the existing link fixtures and `fixtureStats`, by summing them. The
  demo then agrees with itself: Analytics' totals match what the list and the sheets show.
- **The real implementation (workstream C):** SQL aggregates over `links` and `click_events` for `ctx.ownerId`. At
  scale this becomes a daily roll-up table (spec section 14).

## 5. The Analytics page

All from `analytics.overview`, prefetched on the server, in this order:

1. **Numbers strip:** All clicks, Last 24 h, Last 7 days, Links (with "N active" as the caption). One caption below
   it: "Counts update within a few seconds."
2. **Clicks per day, last 30 days:** the same chart as the detail sheet, reused.
3. **Top links:** ranked rows with the slug (mono), the target host and the clicks, each with a proportion bar.
   Tapping a row opens the detail sheet (`?link=`).
4. **Top referrers, top countries, devices:** the sheet's breakdown lists, reused.
5. **States:**
   - zero clicks overall: "No clicks yet. Share a link to start seeing numbers.";
   - loading: skeletons;
   - error: "Couldn't load analytics." with Retry.

## 6. Ownership

- **Frontend (B):**
  - the shell, the three pages, Home's recent list and the analytics UI;
  - the `analytics.overview` contract and its stub: `src/server/analytics/`, a one-line registration in
    `src/server/trpc/router.ts`, and the types in `src/features/analytics/schema.ts`.
- **Backend (C):** replaces the stub body with real queries. It doesn't change the output type without telling the
  owner and B.
