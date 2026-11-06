import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { handleClickBatch } from "@/server/clicks/consumer";
import { recordClicks, type ClickEvent } from "@/server/clicks/record";
import type { ClickMessage } from "@/server/clicks/types";
import { getDb } from "@/server/db/client";
import { clickEvents, links } from "@/server/db/schema";

const db = getDb(env.DB);

function event(id: string, linkId: number, clickedAt: number): ClickEvent {
  return {
    id,
    linkId,
    clickedAt,
    referrer: null,
    country: "US",
    deviceType: "desktop",
    browser: "Chrome",
    os: "macOS",
  };
}

function message(id: string, linkId: number, clickedAt: number): ClickMessage {
  return {
    clickId: id,
    linkId,
    clickedAt,
    referrerHost: "example.org",
    country: "US",
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/120",
  };
}

async function seedLink(slug: string, overrides: Partial<typeof links.$inferInsert> = {}) {
  const [row] = await db
    .insert(links)
    .values({ slug, targetUrl: "https://example.com", ownerId: "u1", ...overrides })
    .returning();
  return row!;
}

async function reload(id: number) {
  const [row] = await db.select().from(links).where(eq(links.id, id));
  return row!;
}

async function eventCount(linkId: number) {
  return (await db.select().from(clickEvents).where(eq(clickEvents.linkId, linkId))).length;
}

function fakeBatch(bodies: unknown[]) {
  const messages = bodies.map((body, i) => ({
    id: `m${i}`,
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  const batch = { queue: "clicks", messages, ackAll: vi.fn(), retryAll: vi.fn() };
  return { batch: batch as unknown as MessageBatch<unknown>, messages };
}

describe("recordClicks", () => {
  it("counts a batch once and sets last_click_at", async () => {
    const link = await seedLink("rc-once");
    await recordClicks(db, [event("a1", link.id, 1000), event("a2", link.id, 2000)]);
    const row = await reload(link.id);
    expect(row.clicks).toBe(2);
    expect(row.lastClickAt?.getTime()).toBe(2000);
  });

  it("the same events again change nothing", async () => {
    const link = await seedLink("rc-again");
    const events = [event("b1", link.id, 1000), event("b2", link.id, 2000)];
    await recordClicks(db, events);
    await recordClicks(db, events);
    const row = await reload(link.id);
    expect(row.clicks).toBe(2);
    expect(row.lastClickAt?.getTime()).toBe(2000);
  });

  it("redeliveries only: last_click_at is not zeroed or nulled", async () => {
    const link = await seedLink("rc-redeliver", { clicks: 1, lastClickAt: new Date(5000) });
    await recordClicks(db, [event("c1", link.id, 1000)]);
    await recordClicks(db, [event("c1", link.id, 1000)]);
    const row = await reload(link.id);
    expect(row.clicks).toBe(2);
    expect(row.lastClickAt?.getTime()).toBe(5000);
  });

  it("100 events in one call stay under D1's parameter limit", async () => {
    const link = await seedLink("rc-100");
    const events = Array.from({ length: 100 }, (_, i) => event(`d${i}`, link.id, 1000 + i));
    await recordClicks(db, events);
    expect((await reload(link.id)).clicks).toBe(100);
  });

  it("a batch spanning two links updates both", async () => {
    const one = await seedLink("rc-two-a");
    const two = await seedLink("rc-two-b");
    await recordClicks(db, [
      event("e1", one.id, 1000),
      event("e2", two.id, 3000),
      event("e3", one.id, 2000),
    ]);
    const a = await reload(one.id);
    const b = await reload(two.id);
    expect(a.clicks).toBe(2);
    expect(a.lastClickAt?.getTime()).toBe(2000);
    expect(b.clicks).toBe(1);
    expect(b.lastClickAt?.getTime()).toBe(3000);
  });

  it("links.clicks equals the number of click_events rows", async () => {
    const link = await seedLink("rc-equal");
    const events = [event("f1", link.id, 1000), event("f2", link.id, 1100)];
    await recordClicks(db, events);
    await recordClicks(db, [...events, event("f3", link.id, 1200)]);
    expect((await reload(link.id)).clicks).toBe(await eventCount(link.id));
    expect(await eventCount(link.id)).toBe(3);
  });

  it("stores the redirect time from the event, not the consumer time", async () => {
    const link = await seedLink("rc-time");
    await recordClicks(db, [event("g1", link.id, 1234)]);
    const [row] = await db.select().from(clickEvents).where(eq(clickEvents.id, "g1"));
    expect(row?.clickedAt.getTime()).toBe(1234);
  });

  it("returns at once for an empty list", async () => {
    await expect(recordClicks(db, [])).resolves.toBeUndefined();
  });
});

describe("handleClickBatch", () => {
  let errorSpy: MockInstance<typeof console.error>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a malformed message, logs click.bad_message, records the rest", async () => {
    const link = await seedLink("hb-bad");
    const { batch, messages } = fakeBatch([
      { foo: 1 },
      message("h1", link.id, 1000),
      message("h2", link.id, 2000),
    ]);
    await handleClickBatch(batch, env);
    expect(messages[0]!.retry).toHaveBeenCalledTimes(1);
    expect(messages[0]!.ack).not.toHaveBeenCalled();
    expect(messages[1]!.retry).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes("click.bad_message"))).toBe(true);
    const row = await reload(link.id);
    expect(row.clicks).toBe(2);
    const [stored] = await db.select().from(clickEvents).where(eq(clickEvents.id, "h1"));
    expect(stored?.referrer).toBe("example.org");
    expect(stored?.deviceType).toBe("desktop");
  });

  it("recordClicks failure: logs click.record_failed and rethrows", async () => {
    const link = await seedLink("hb-fail");
    const failing = {
      ...env,
      DB: {
        prepare: () => {
          throw new Error("d1 down");
        },
        batch: () => Promise.reject(new Error("d1 down")),
      },
    } as unknown as CloudflareEnv;
    const { batch } = fakeBatch([message("i1", link.id, 1000)]);
    await expect(handleClickBatch(batch, failing)).rejects.toThrow();
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes("click.record_failed"))).toBe(true);
  });
});
