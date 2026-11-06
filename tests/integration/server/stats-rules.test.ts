import { afterEach, describe, expect, it, vi } from "vitest";
import { insertClicks, insertLink } from "../../support/db";
import { callerFor } from "../../support/trpc";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function freezeClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("links.stats breakdowns are all-time", () => {
  it("counts clicks older than 30 days in referrers, countries and devices", async () => {
    freezeClock();
    const link = await insertLink();
    await insertClicks(link.id, [
      { clickedAt: ago(90 * DAY), referrer: "old.com", country: "FR", deviceType: "tablet" },
      { clickedAt: ago(1000), referrer: "new.com", country: "US", deviceType: "mobile" },
    ]);
    const stats = await callerFor().links.stats({ slug: link.slug });
    expect(stats.referrers.map((r) => r.host).sort()).toEqual(["new.com", "old.com"]);
    expect(stats.countries.map((r) => r.country).sort()).toEqual(["FR", "US"]);
    expect(stats.devices.map((r) => r.deviceType).sort()).toEqual(["mobile", "tablet"]);
    expect(stats.daily.reduce((s, d) => s + d.clicks, 0)).toBe(1);
  });
});

describe("analytics.overview", () => {
  it("limits referrers, countries and devices to the 30-day window", async () => {
    freezeClock();
    const link = await insertLink();
    await insertClicks(link.id, [
      { clickedAt: ago(90 * DAY), referrer: "old.com", country: "FR", deviceType: "tablet" },
      { clickedAt: ago(1000), referrer: "new.com", country: "US", deviceType: "mobile" },
    ]);
    const o = await callerFor().analytics.overview();
    expect(o.referrers).toEqual([{ host: "new.com", clicks: 1 }]);
    expect(o.countries).toEqual([{ country: "US", clicks: 1 }]);
    expect(o.devices).toEqual([{ deviceType: "mobile", clicks: 1 }]);
    expect(o.totals.clicks).toBe(2);
  });

  it("orders by clicks desc, then null last, then key ascending", async () => {
    freezeClock();
    const link = await insertLink();
    const at = (referrer: string | null, n: number) =>
      Array.from({ length: n }, () => ({ clickedAt: ago(1000), referrer }));
    await insertClicks(link.id, [
      ...at("b.com", 2),
      ...at("a.com", 2),
      ...at(null, 2),
      ...at("z.com", 3),
      ...at("c.com", 1),
    ]);
    const o = await callerFor().analytics.overview();
    expect(o.referrers.map((r) => r.host)).toEqual(["z.com", "a.com", "b.com", null, "c.com"]);
  });

  it("uses rolling 24h and 7d windows with inclusive edges", async () => {
    freezeClock();
    const link = await insertLink();
    await insertClicks(link.id, [
      { clickedAt: ago(DAY) },
      { clickedAt: ago(DAY + 1) },
      { clickedAt: ago(7 * DAY) },
      { clickedAt: ago(7 * DAY + 1) },
    ]);
    const o = await callerFor().analytics.overview();
    expect(o.totals.last24h).toBe(1);
    expect(o.totals.last7d).toBe(3);
  });

  it("returns 30 zero-filled UTC days, oldest first, ending today", async () => {
    freezeClock();
    const link = await insertLink();
    await insertClicks(link.id, [{ clickedAt: ago(0) }]);
    const { daily } = await callerFor().analytics.overview();
    expect(daily).toHaveLength(30);
    expect(daily[0]).toEqual({ date: "2026-10-08", clicks: 0 });
    expect(daily[29]).toEqual({ date: "2026-11-06", clicks: 1 });
  });

  it("treats expires_at == now as expired for activeLinks", async () => {
    freezeClock();
    await insertLink({ expiresAt: NOW });
    await insertLink({ expiresAt: new Date(NOW.getTime() + 1) });
    await insertLink({ expiresAt: null });
    const { totals } = await callerFor().analytics.overview();
    expect(totals.links).toBe(3);
    expect(totals.activeLinks).toBe(2);
  });

  it("orders topLinks by clicks desc, then id desc", async () => {
    freezeClock();
    const a = await insertLink();
    const b = await insertLink();
    const c = await insertLink();
    await insertClicks(a.id, [{ clickedAt: ago(1000) }, { clickedAt: ago(1000) }]);
    await insertClicks(b.id, [{ clickedAt: ago(1000) }, { clickedAt: ago(1000) }]);
    await insertClicks(c.id, [{ clickedAt: ago(1000) }]);
    const { topLinks } = await callerFor().analytics.overview();
    expect(topLinks.map((l) => l.slug)).toEqual([b.slug, a.slug, c.slug]);
  });
});
