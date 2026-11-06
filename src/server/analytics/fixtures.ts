// TEMP: stateless stub until workstream C implements analytics.overview with SQL.
import "server-only";
import type { AnalyticsOverview } from "@/features/analytics/schema";
import { fixtureList, fixtureStats } from "@/server/links/fixtures";

/** Adds up `clicks` per key and returns the top `limit`, largest first. */
function topBy<K extends string | null>(
  rows: { key: K; clicks: number }[],
  limit: number,
): { key: K; clicks: number }[] {
  const totals = new Map<K, number>();
  for (const row of rows) totals.set(row.key, (totals.get(row.key) ?? 0) + row.clicks);
  return [...totals]
    .map(([key, clicks]) => ({ key, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
}

/**
 * Derived from the link fixtures, so Analytics agrees with what the list and the detail
 * sheets show. Pure: everything comes from `baseUrl` and `now`.
 */
export function fixtureOverview(baseUrl: string, now: Date): AnalyticsOverview {
  const links = fixtureList(baseUrl, { limit: 50 }, now).items;
  const stats = links.map((link) => fixtureStats(baseUrl, link.slug, now));

  const daily = stats[0].daily.map((day, i) => ({
    date: day.date,
    clicks: stats.reduce((sum, s) => sum + s.daily[i].clicks, 0),
  }));

  return {
    totals: {
      clicks: links.reduce((sum, l) => sum + l.clicks, 0),
      last24h: stats.reduce((sum, s) => sum + s.totals.last24h, 0),
      last7d: stats.reduce((sum, s) => sum + s.totals.last7d, 0),
      links: links.length,
      activeLinks: links.filter((l) => !l.isExpired).length,
    },
    daily,
    topLinks: [...links]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5)
      .map(({ slug, shortUrl, targetUrl, clicks }) => ({ slug, shortUrl, targetUrl, clicks })),
    referrers: topBy(
      stats.flatMap((s) => s.referrers.map((r) => ({ key: r.host, clicks: r.clicks }))),
      5,
    ).map(({ key, clicks }) => ({ host: key, clicks })),
    countries: topBy(
      stats.flatMap((s) => s.countries.map((c) => ({ key: c.country, clicks: c.clicks }))),
      5,
    ).map(({ key, clicks }) => ({ country: key, clicks })),
    devices: topBy(
      stats.flatMap((s) => s.devices.map((d) => ({ key: d.deviceType, clicks: d.clicks }))),
      5,
    ).map(({ key, clicks }) => ({ deviceType: key as string, clicks })),
  };
}
