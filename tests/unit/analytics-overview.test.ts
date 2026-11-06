import { describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { createContext } from "@/server/trpc/context";
import { createCallerFactory } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/router";

const caller = createCallerFactory(appRouter)(
  createContext({ db: {} as Db, env: {} as CloudflareEnv, baseUrl: "https://sho.rt" }),
);

const sortedDesc = (xs: { clicks: number }[]) =>
  xs.every((x, i) => i === 0 || xs[i - 1].clicks >= x.clicks);

describe("analytics.overview (stub)", () => {
  it("agrees with the link list", async () => {
    const [overview, page1] = await Promise.all([
      caller.analytics.overview(),
      caller.links.list({ limit: 50 }),
    ]);
    expect(overview.totals.links).toBe(23);
    expect(overview.totals.activeLinks).toBe(22); // only demo021 is expired
    expect(overview.totals.clicks).toBe(page1.items.reduce((n, l) => n + l.clicks, 0));
  });

  it("returns 30 days, oldest first, and consistent windows", async () => {
    const { daily, totals } = await caller.analytics.overview();
    expect(daily).toHaveLength(30);
    expect(daily.map((d) => d.date)).toEqual([...daily.map((d) => d.date)].sort());
    expect(totals.last24h).toBe(daily[29].clicks);
    expect(totals.last7d).toBe(daily.slice(-7).reduce((n, d) => n + d.clicks, 0));
  });

  it("ranks top links and breakdowns, at most 5 each", async () => {
    const o = await caller.analytics.overview();
    expect(o.topLinks).toHaveLength(5);
    expect(o.topLinks[0]).toMatchObject({ slug: "demo023", shortUrl: "https://sho.rt/demo023" });
    for (const list of [o.topLinks, o.referrers, o.countries, o.devices]) {
      expect(list.length).toBeLessThanOrEqual(5);
      expect(sortedDesc(list)).toBe(true);
    }
  });
});
