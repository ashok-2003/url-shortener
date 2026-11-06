import "server-only";
import type { AnalyticsOverview } from "@/features/analytics/schema";
import { aggregateClicks } from "@/server/clicks/aggregate";
import { LINKS } from "@/server/config";
import type { Context } from "@/server/trpc/context";

/** analytics.overview: totals across all of the user's links, plus the last 30 UTC days of clicks. */
export async function analyticsOverview(ctx: Context): Promise<AnalyticsOverview> {
  const now = Date.now();
  const d1 = ctx.env.DB;
  const [[totals, top], agg] = await Promise.all([
    d1.batch([
      d1
        .prepare(
          `SELECT coalesce(sum(clicks), 0) AS clicks, count(*) AS links,
                  sum(CASE WHEN expires_at IS NULL OR expires_at > ? THEN 1 ELSE 0 END) AS activeLinks
             FROM links WHERE owner_id = ?`,
        )
        .bind(now, ctx.ownerId),
      d1
        .prepare(
          `SELECT slug, target_url AS targetUrl, clicks FROM links
            WHERE owner_id = ? AND clicks > 0 ORDER BY clicks DESC, id DESC LIMIT ?`,
        )
        .bind(ctx.ownerId, LINKS.statsTopN),
    ]),
    aggregateClicks(d1, { ownerId: ctx.ownerId }, now),
  ]);

  const t = (totals.results[0] ?? {}) as { clicks?: number; links?: number; activeLinks?: number | null };
  return {
    totals: {
      clicks: t.clicks ?? 0,
      last24h: agg.last24h,
      last7d: agg.last7d,
      links: t.links ?? 0,
      activeLinks: t.activeLinks ?? 0,
    },
    daily: agg.daily,
    topLinks: (top.results as { slug: string; targetUrl: string; clicks: number }[]).map((l) => ({
      ...l,
      shortUrl: `${ctx.baseUrl}/${l.slug}`,
    })),
    referrers: agg.referrers,
    countries: agg.countries,
    devices: agg.devices,
  };
}
