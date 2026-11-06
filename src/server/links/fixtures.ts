// TEMP: stateless fixtures until workstream C replaces these bodies.
import "server-only";
import { TRPCError } from "@trpc/server";
import {
  PRESET_DURATION_MS,
  type ExpiryInput,
  type LinkStats,
  type LinkSummary,
  type ListLinksOutput,
} from "@/features/links/schema";
import type { Context } from "@/server/trpc/context";
import { RateLimitedError } from "@/server/trpc/errors";

const DAY = 86_400_000;
const FIXTURE_COUNT = 23;
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const TARGETS = [
  "https://example.com/blog/2026/11/how-we-cut-our-p95-latency-in-half",
  "https://github.com/vercel/next.js/issues/70000",
  "https://news.ycombinator.com/item?id=42424242",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit?usp=sharing&ts=6543210f&heading=h.abcdefghijkl#heading=h.abcdefghijkl-and-a-very-long-fragment-for-wrapping-tests",
  "https://developers.cloudflare.com/workers/runtime-apis/",
  "https://en.wikipedia.org/wiki/URL_shortening",
];

function slugFor(id: number): string {
  return `demo${String(id).padStart(3, "0")}`;
}

function clicksFor(id: number): number {
  if (id === 23) return 1284;
  if (id === 20) return 0;
  return ((id * 37) % 400) + 5;
}

function expiresAtFor(id: number, now: Date): Date | null {
  if (id === 22) return new Date(now.getTime() + 3 * 3_600_000);
  if (id === 21) return new Date(now.getTime() - 2 * DAY);
  return null;
}

function fixtureLink(id: number, baseUrl: string, now: Date): LinkSummary {
  const expires = expiresAtFor(id, now);
  return {
    slug: slugFor(id),
    shortUrl: `${baseUrl}/${slugFor(id)}`,
    targetUrl: TARGETS[id % TARGETS.length],
    clicks: clicksFor(id),
    createdAt: new Date(now.getTime() - (FIXTURE_COUNT + 1 - id) * DAY).toISOString(),
    expiresAt: expires ? expires.toISOString() : null,
    isExpired: expires ? expires.getTime() <= now.getTime() : false,
  };
}

export function fixtureList(
  baseUrl: string,
  input: { cursor?: number | null; limit: number },
  now: Date,
): ListLinksOutput {
  const ids: number[] = [];
  for (let id = FIXTURE_COUNT; id >= 1; id--) {
    if (input.cursor == null || id < input.cursor) ids.push(id);
  }
  const page = ids.slice(0, input.limit);
  return {
    items: page.map((id) => fixtureLink(id, baseUrl, now)),
    nextCursor: ids.length > page.length ? page[page.length - 1] : null,
  };
}

function randomSlug(): string {
  let out = "";
  while (out.length < 7) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b >= 248) continue; // rejection sampling: 248 = 62 * 4
      if (out.length < 7) out += ALPHABET[b % 62];
    }
  }
  return out;
}

function expiryDate(expiry: ExpiryInput, now: Date): Date | null {
  if (expiry.kind === "preset") {
    return new Date(now.getTime() + PRESET_DURATION_MS[expiry.preset]);
  }
  if (expiry.kind === "custom") return new Date(expiry.at);
  return null;
}

export function createFixtureLink(
  ctx: Pick<Context, "baseUrl">,
  input: { url: string; expiry: ExpiryInput },
  now: Date,
): LinkSummary {
  const host = new URL(input.url).hostname;
  if (host === "ratelimit.test") {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "You've made 5 links in the last minute.",
      cause: new RateLimitedError(42),
    });
  }
  if (host === "error.test") {
    // Simulates an unexpected failure; the error formatter must hide it.
    throw new Error("db exploded at 10.0.0.1");
  }
  const slug = randomSlug();
  const expires = expiryDate(input.expiry, now);
  return {
    slug,
    shortUrl: `${ctx.baseUrl}/${slug}`,
    targetUrl: input.url,
    clicks: 0,
    createdAt: now.toISOString(),
    expiresAt: expires ? expires.toISOString() : null,
    isExpired: false,
  };
}

export function fixtureStats(
  baseUrl: string,
  slug: string,
  now: Date,
): LinkStats {
  const id = Array.from({ length: FIXTURE_COUNT }, (_, i) => i + 1).find(
    (n) => slugFor(n) === slug,
  );
  if (id === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This link doesn't exist.",
    });
  }
  const link = fixtureLink(id, baseUrl, now);
  const empty = link.clicks === 0;
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const daily = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(todayUtc - (29 - i) * DAY).toISOString().slice(0, 10),
    clicks: empty ? 0 : (id * 13 + i * 29) % 41,
  }));
  const share = (n: number) => (empty ? 0 : Math.max(1, Math.round((link.clicks * n) / 100)));
  return {
    link,
    lastClickAt: empty ? null : new Date(now.getTime() - 5 * 60_000).toISOString(),
    totals: {
      all: link.clicks,
      last24h: daily[29].clicks,
      last7d: daily.slice(-7).reduce((n, d) => n + d.clicks, 0),
    },
    daily,
    referrers: empty
      ? []
      : [
          { host: "t.co", clicks: share(35) },
          { host: "www.google.com", clicks: share(25) },
          { host: null, clicks: share(20) },
          { host: "news.ycombinator.com", clicks: share(12) },
          { host: "www.linkedin.com", clicks: share(8) },
        ],
    countries: empty
      ? []
      : [
          { country: "IN", clicks: share(40) },
          { country: "US", clicks: share(28) },
          { country: "GB", clicks: share(15) },
          { country: "DE", clicks: share(10) },
          { country: null, clicks: share(7) },
        ],
    devices: empty
      ? []
      : [
          { deviceType: "mobile", clicks: share(60) },
          { deviceType: "desktop", clicks: share(32) },
          { deviceType: "tablet", clicks: share(8) },
        ],
  };
}
