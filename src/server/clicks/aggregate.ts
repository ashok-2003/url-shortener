import "server-only";
import { LINKS } from "@/server/config";

const DAY = 86_400_000;

export type ClickAggregates = {
  daily: { date: string; clicks: number }[];
  last24h: number;
  last7d: number;
  referrers: { host: string | null; clicks: number }[];
  countries: { country: string | null; clicks: number }[];
  devices: { deviceType: string; clicks: number }[];
};

/**
 * Click aggregates over the last 30 UTC days, for all of one owner's links or one link of theirs.
 * Raw SQL GROUP BYs over click_events, sent as a single D1 batch: one round trip.
 */
export async function aggregateClicks(
  d1: D1Database,
  scope: { ownerId: string; linkId?: number },
  now: number,
): Promise<ClickAggregates> {
  const todayUtc = Math.floor(now / DAY) * DAY;
  const since = todayUtc - (LINKS.statsDays - 1) * DAY;
  const byLink = scope.linkId === undefined ? "" : " AND e.link_id = ?";
  const from = `FROM click_events e JOIN links l ON l.id = e.link_id WHERE l.owner_id = ?${byLink} AND e.clicked_at >= ?`;
  const stmt = (sql: string, start: number) =>
    d1
      .prepare(sql.replace("{from}", from))
      .bind(...(scope.linkId === undefined ? [scope.ownerId, start] : [scope.ownerId, scope.linkId, start]));
  const top = LINKS.statsTopN;

  const [daily, referrers, countries, devices, day, week] = await d1.batch([
    stmt(`SELECT strftime('%Y-%m-%d', e.clicked_at / 1000, 'unixepoch') AS date, count(*) AS clicks {from} GROUP BY date`, since),
    stmt(`SELECT e.referrer AS host, count(*) AS clicks {from} GROUP BY e.referrer ORDER BY clicks DESC LIMIT ${top}`, since),
    stmt(`SELECT e.country AS country, count(*) AS clicks {from} GROUP BY e.country ORDER BY clicks DESC LIMIT ${top}`, since),
    stmt(`SELECT e.device_type AS deviceType, count(*) AS clicks {from} GROUP BY e.device_type ORDER BY clicks DESC`, since),
    stmt(`SELECT count(*) AS n {from}`, now - DAY),
    stmt(`SELECT count(*) AS n {from}`, now - 7 * DAY),
  ]);

  const perDay = new Map((daily.results as { date: string; clicks: number }[]).map((r) => [r.date, r.clicks]));
  const count = (r: D1Result) => (r.results[0] as { n: number } | undefined)?.n ?? 0;

  return {
    daily: Array.from({ length: LINKS.statsDays }, (_, i) => {
      const date = new Date(since + i * DAY).toISOString().slice(0, 10);
      return { date, clicks: perDay.get(date) ?? 0 };
    }),
    last24h: count(day),
    last7d: count(week),
    referrers: referrers.results as ClickAggregates["referrers"],
    countries: countries.results as ClickAggregates["countries"],
    devices: devices.results as ClickAggregates["devices"],
  };
}
