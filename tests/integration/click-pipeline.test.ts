import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { recordClicks, type ClickEvent } from "@/server/clicks/record";
import { insertLink, testDb } from "../support/db";

const T0 = Date.UTC(2026, 10, 6, 12, 0, 0);

let seq = 0;
function event(linkId: number, offsetMs: number): ClickEvent {
  seq += 1;
  return {
    id: `evt-${seq}-${crypto.randomUUID()}`,
    linkId,
    clickedAt: T0 + offsetMs,
    referrer: null,
    country: "IN",
    deviceType: "desktop",
    browser: "Chrome",
    os: "macOS",
  };
}

async function linkRow(id: number) {
  const row = await env.DB.prepare(
    "SELECT clicks, last_click_at FROM links WHERE id = ?",
  )
    .bind(id)
    .first<{ clicks: number; last_click_at: number | null }>();
  if (!row) throw new Error(`link ${id} missing`);
  return row;
}

async function eventCount(linkId: number): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM click_events WHERE link_id = ?",
  )
    .bind(linkId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("click pipeline: recordClicks", () => {
  it("a batch of 3 counts 3, writes three rows, sets last_click_at to the newest and keeps clicked_at", async () => {
    const link = await insertLink();
    const events = [
      event(link.id, 3000),
      event(link.id, 1000),
      event(link.id, 2000),
    ];
    await recordClicks(testDb(), events);

    const row = await linkRow(link.id);
    expect(row.clicks).toBe(3);
    expect(row.last_click_at).toBe(T0 + 3000);
    expect(await eventCount(link.id)).toBe(3);

    const { results } = await env.DB.prepare(
      "SELECT id, clicked_at FROM click_events WHERE link_id = ? ORDER BY clicked_at",
    )
      .bind(link.id)
      .all<{ id: string; clicked_at: number }>();
    expect(results.map((r) => r.clicked_at)).toEqual([
      T0 + 1000,
      T0 + 2000,
      T0 + 3000,
    ]);
    expect(new Set(results.map((r) => r.id))).toEqual(
      new Set(events.map((e) => e.id)),
    );
  });

  it("the same batch twice counts once", async () => {
    const link = await insertLink();
    const events = [event(link.id, 1), event(link.id, 2), event(link.id, 3)];
    await recordClicks(testDb(), events);
    await recordClicks(testDb(), events);

    expect((await linkRow(link.id)).clicks).toBe(3);
    expect(await eventCount(link.id)).toBe(3);
  });

  it("a partial redelivery counts only new events", async () => {
    const link = await insertLink();
    const [e1, e2, e3] = [
      event(link.id, 1000),
      event(link.id, 2000),
      event(link.id, 3000),
    ];
    await recordClicks(testDb(), [e1, e2]);
    await recordClicks(testDb(), [e2, e3]);

    const row = await linkRow(link.id);
    expect(row.clicks).toBe(3);
    expect(row.last_click_at).toBe(T0 + 3000);
    expect(await eventCount(link.id)).toBe(3);
  });

  it("one batch across two links updates both", async () => {
    const a = await insertLink();
    const b = await insertLink();
    await recordClicks(testDb(), [
      event(a.id, 1000),
      event(b.id, 5000),
      event(a.id, 2000),
    ]);

    expect(await linkRow(a.id)).toEqual({
      clicks: 2,
      last_click_at: T0 + 2000,
    });
    expect(await linkRow(b.id)).toEqual({
      clicks: 1,
      last_click_at: T0 + 5000,
    });
  });

  it("clicks always equals count(click_events), per link", async () => {
    const a = await insertLink();
    const b = await insertLink();
    const a1 = event(a.id, 1);
    const a2 = event(a.id, 2);
    const b1 = event(b.id, 3);
    await recordClicks(testDb(), [a1, a2, b1]);
    await recordClicks(testDb(), [a1, a2, b1]);
    await recordClicks(testDb(), [a2, event(a.id, 4), event(b.id, 5)]);
    await recordClicks(testDb(), [event(b.id, 6)]);

    for (const link of [a, b]) {
      const row = await linkRow(link.id);
      expect(row.clicks).toBe(await eventCount(link.id));
    }
    expect((await linkRow(a.id)).clicks).toBe(3);
    expect((await linkRow(b.id)).clicks).toBe(3);
  });
});
