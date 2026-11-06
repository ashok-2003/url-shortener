import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPIRY_PRESETS,
  PRESET_DURATION_MS,
  SLUG_PATTERN,
} from "@/features/links/schema";
import { links } from "@/server/db/schema";
import { insertClicks, insertLink, testDb } from "../support/db";
import { callerFor, trpcHttp } from "../support/trpc";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function freezeClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("links input validation", () => {
  it("list rejects limit 0 and 51 with BAD_REQUEST", async () => {
    for (const limit of [0, 51]) {
      await expect(callerFor().links.list({ limit })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("stats rejects a non-slug", async () => {
    await expect(
      callerFor().links.stats({ slug: "abc" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// PENDING(C): real create/list/stats replace the stub fixtures
describe.skip("links contract", () => {
  describe("create", () => {
    it("returns a LinkSummary", async () => {
      const link = await callerFor().links.create({
        url: "https://Example.COM",
      });
      expect(link.slug).toMatch(SLUG_PATTERN);
      expect(link.shortUrl).toBe(`https://sho.rt/${link.slug}`);
      expect(link.targetUrl).toBe(new URL("https://Example.COM").href);
      expect(link.targetUrl).toBe("https://example.com/");
      expect(link.clicks).toBe(0);
      expect(link.isExpired).toBe(false);
      expect(link.expiresAt).toBeNull();
    });

    it("sets expiresAt for each preset on the frozen clock", async () => {
      freezeClock();
      for (const p of EXPIRY_PRESETS) {
        const link = await callerFor().links.create({
          url: "https://example.com/preset",
          expiry: { kind: "preset", preset: p },
        });
        expect(link.expiresAt).not.toBeNull();
        expect(
          Date.parse(link.expiresAt as string) - Date.parse(link.createdAt),
        ).toBe(PRESET_DURATION_MS[p]);
      }
    });

    it("stores a custom expiry as the same instant", async () => {
      freezeClock();
      const at = "2026-11-06T17:35:00+05:30";
      const link = await callerFor().links.create({
        url: "https://example.com/custom",
        expiry: { kind: "custom", at },
      });
      expect(link.expiresAt).toBe(new Date(at).toISOString());
    });

    it("lists the new link first", async () => {
      await insertLink({ slug: "older00" });
      const link = await callerFor().links.create({
        url: "https://example.com/new",
      });
      const page = await callerFor().links.list({});
      expect(page.items[0].slug).toBe(link.slug);
    });

    it("gives the same URL two different slugs", async () => {
      const a = await callerFor().links.create({
        url: "https://example.com/x",
      });
      const b = await callerFor().links.create({
        url: "https://example.com/x",
      });
      expect(a.slug).not.toBe(b.slug);
    });

    it("rejects a normalized URL over 2048 characters", async () => {
      const url = "https://example.com/" + "€".repeat(677);
      const { body } = await trpcHttp("POST", "links.create", { url });
      expect(body.error?.data.fieldErrors?.url).toEqual([
        "Links can be at most 2048 characters",
      ]);
    });

    it("fails with INTERNAL_SERVER_ERROR after 3 slug collisions", async () => {
      const zeros = <T extends ArrayBufferView | null>(array: T): T => {
        if (array) {
          new Uint8Array(
            array.buffer,
            array.byteOffset,
            array.byteLength,
          ).fill(0);
        }
        return array;
      };
      try {
        vi.spyOn(crypto, "getRandomValues").mockImplementation(zeros);
      } catch {
        vi.stubGlobal("crypto", {
          getRandomValues: zeros,
          randomUUID: crypto.randomUUID.bind(crypto),
          subtle: crypto.subtle,
        });
      }
      await callerFor().links.create({ url: "https://example.com/one" });
      await expect(
        callerFor().links.create({ url: "https://example.com/two" }),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong on our side.",
      });
      expect(await testDb().select().from(links)).toHaveLength(1);
    });
  });

  describe("list", () => {
    async function seed(n: number) {
      const ids = new Map<string, number>();
      for (let i = 0; i < n; i++) {
        const row = await insertLink();
        ids.set(row.slug, row.id);
      }
      return ids;
    }

    it("pages 20, 20 and 5 in id-descending order", async () => {
      const idBySlug = await seed(45);
      const expected = [...idBySlug.values()].sort((a, b) => b - a);
      const caller = callerFor();
      const p1 = await caller.links.list({});
      const p2 = await caller.links.list({ cursor: p1.nextCursor });
      const p3 = await caller.links.list({ cursor: p2.nextCursor });
      expect([p1, p2, p3].map((p) => p.items.length)).toEqual([20, 20, 5]);
      const walked = [p1, p2, p3].flatMap((p) =>
        p.items.map((i) => idBySlug.get(i.slug)),
      );
      expect(walked).toEqual(expected);
      expect(p1.nextCursor).not.toBeNull();
      expect(p2.nextCursor).not.toBeNull();
      expect(p3.nextCursor).toBeNull();
    });

    it("walking the cursors yields every link exactly once", async () => {
      await seed(45);
      const caller = callerFor();
      const seen: string[] = [];
      let cursor: number | null = null;
      do {
        const page: Awaited<ReturnType<typeof caller.links.list>> =
          await caller.links.list({ cursor, limit: 7 });
        seen.push(...page.items.map((i) => i.slug));
        cursor = page.nextCursor;
      } while (cursor !== null);
      expect(seen).toHaveLength(45);
      expect(new Set(seen).size).toBe(45);
    });

    it("limit 50 returns all 45", async () => {
      await seed(45);
      const page = await callerFor().links.list({ limit: 50 });
      expect(page.items).toHaveLength(45);
      expect(page.nextCursor).toBeNull();
    });

    it("marks a link with a past expiresAt as expired", async () => {
      const link = await insertLink({
        expiresAt: new Date(Date.now() - HOUR),
      });
      const page = await callerFor().links.list({});
      expect(page.items.find((i) => i.slug === link.slug)?.isExpired).toBe(
        true,
      );
    });
  });

  describe("stats", () => {
    async function statsFor(events: Parameters<typeof insertClicks>[1]) {
      freezeClock();
      const link = await insertLink();
      await insertClicks(link.id, events);
      return callerFor().links.stats({ slug: link.slug });
    }

    it("daily covers 30 UTC days ending today, oldest first", async () => {
      const stats = await statsFor([{ clickedAt: NOW }]);
      expect(stats.daily).toHaveLength(30);
      expect(stats.daily[0].date).toBe("2026-10-08");
      expect(stats.daily[29].date).toBe("2026-11-06");
      expect(stats.daily[29].clicks).toBe(1);
    });

    it("buckets by UTC day and keeps old clicks in totals.all only", async () => {
      const stats = await statsFor([
        { clickedAt: new Date("2026-11-05T23:59:59.999Z") },
        { clickedAt: new Date("2026-10-07T12:00:00Z") },
      ]);
      const byDate = new Map(stats.daily.map((d) => [d.date, d.clicks]));
      expect(byDate.get("2026-11-05")).toBe(1);
      expect(byDate.has("2026-10-07")).toBe(false);
      expect(stats.daily.reduce((s, d) => s + d.clicks, 0)).toBe(1);
      expect(stats.totals.all).toBe(2);
    });

    it("last24h has an inclusive lower edge", async () => {
      const stats = await statsFor([
        { clickedAt: new Date(NOW.getTime() - DAY) },
        { clickedAt: new Date(NOW.getTime() - DAY - 1) },
      ]);
      expect(stats.totals.last24h).toBe(1);
    });

    it("last7d has an inclusive lower edge", async () => {
      const stats = await statsFor([
        { clickedAt: new Date(NOW.getTime() - 7 * DAY) },
        { clickedAt: new Date(NOW.getTime() - 7 * DAY - 1) },
      ]);
      expect(stats.totals.last7d).toBe(1);
    });

    it("totals.all equals links.clicks", async () => {
      const stats = await statsFor(
        Array.from({ length: 12 }, (_, i) => ({
          clickedAt: new Date(NOW.getTime() - i * HOUR),
        })),
      );
      expect(stats.totals.all).toBe(stats.link.clicks);
      expect(stats.totals.all).toBe(12);
    });

    it("ranks referrers by clicks, then null last, then host", async () => {
      const ref = (referrer: string | null, n: number) =>
        Array.from({ length: n }, () => ({ referrer }));
      const stats = await statsFor([
        ...ref("t.co", 3),
        ...ref(null, 3),
        ...ref("www.google.com", 3),
        ...ref("a.com", 1),
        ...ref("b.com", 1),
        ...ref("c.com", 1),
      ]);
      expect(stats.referrers.map((r) => r.host)).toEqual([
        "t.co",
        "www.google.com",
        null,
        "a.com",
        "b.com",
      ]);
    });

    it("puts the biggest direct traffic first", async () => {
      const stats = await statsFor([
        ...Array.from({ length: 10 }, () => ({ referrer: null })),
        ...["a.com", "b.com", "c.com", "d.com", "e.com"].map((referrer) => ({
          referrer,
        })),
      ]);
      expect(stats.referrers[0]).toEqual({ host: null, clicks: 10 });
      expect(stats.referrers).toHaveLength(5);
    });

    it("ranks countries by the same rule, top 5", async () => {
      const c = (country: string | null, n: number) =>
        Array.from({ length: n }, () => ({ country }));
      const stats = await statsFor([
        ...c("US", 3),
        ...c(null, 3),
        ...c("DE", 3),
        ...c("AA", 1),
        ...c("BB", 1),
        ...c("CC", 1),
      ]);
      expect(stats.countries.map((r) => r.country)).toEqual([
        "DE",
        "US",
        null,
        "AA",
        "BB",
      ]);
    });

    it("lists every device type that has clicks", async () => {
      const stats = await statsFor([
        { deviceType: "desktop" },
        { deviceType: "desktop" },
        { deviceType: "mobile" },
        { deviceType: "tablet" },
        { deviceType: "bot" },
      ]);
      expect(
        Object.fromEntries(stats.devices.map((d) => [d.deviceType, d.clicks])),
      ).toEqual({ desktop: 2, mobile: 1, tablet: 1, bot: 1 });
    });

    it("returns zeros and empty lists with no clicks", async () => {
      const stats = await statsFor([]);
      expect(stats.daily).toHaveLength(30);
      expect(stats.daily.every((d) => d.clicks === 0)).toBe(true);
      expect(stats.totals).toEqual({ all: 0, last24h: 0, last7d: 0 });
      expect(stats.referrers).toEqual([]);
      expect(stats.countries).toEqual([]);
      expect(stats.devices).toEqual([]);
      expect(stats.lastClickAt).toBeNull();
    });
  });
});
