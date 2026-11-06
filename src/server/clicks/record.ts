import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { clickEvents, links } from "@/server/db/schema";
import type { ClickEvent } from "./types";

export type { ClickEvent } from "./types";

/**
 * Stores a batch of clicks and bumps each link's counters in one D1 batch
 * (one transaction). Rows are tagged with a fresh `batchId`; the counter
 * update counts only rows carrying that id, so events already stored by an
 * earlier delivery (conflict, do nothing) are never counted twice.
 */
export async function recordClicks(db: Db, events: ClickEvent[]): Promise<void> {
  if (events.length === 0) return;
  const batchId = crypto.randomUUID();

  const inserts = events.map((e) =>
    db
      .insert(clickEvents)
      .values({
        id: e.id,
        linkId: e.linkId,
        clickedAt: new Date(e.clickedAt),
        referrer: e.referrer,
        country: e.country,
        deviceType: e.deviceType,
        browser: e.browser,
        os: e.os,
        batchId,
      })
      .onConflictDoNothing({ target: clickEvents.id }),
  );

  const linkIds = [...new Set(events.map((e) => e.linkId))];
  const updates = linkIds.map((linkId) => {
    const mine = and(eq(clickEvents.batchId, batchId), eq(clickEvents.linkId, linkId));
    return db
      .update(links)
      .set({
        clicks: sql`${links.clicks} + (select count(*) from ${clickEvents} where ${mine})`,
        lastClickAt: sql`max(coalesce(${links.lastClickAt}, 0), (select max(${clickEvents.clickedAt}) from ${clickEvents} where ${mine}))`,
      })
      .where(
        and(
          eq(links.id, linkId),
          sql`exists (select 1 from ${clickEvents} where ${mine})`,
        ),
      );
  });

  await db.batch([...inserts, ...updates] as [(typeof inserts)[number], ...(typeof inserts)[number][]]);
}
