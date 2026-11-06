// No "server-only" guard: worker.ts's queue consumer imports this outside the Next.js react-server graph.
import type { ClickMessage } from "./types";
import { parseUserAgent } from "./user-agent";

/**
 * Stores a batch of clicks idempotently (spec section 7), in ONE D1 batch, which D1 runs as a
 * single transaction:
 *  1. insert each event keyed by its clickId, ignoring ids already stored (queue redelivery);
 *  2. add to links.clicks only the rows THIS run inserted, found by this run's batchId.
 * A redelivered click keeps its old batchId, so it is counted exactly once.
 */
export async function recordClicks(db: D1Database, messages: ClickMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const batchId = crypto.randomUUID();

  const inserts = messages.map((m) => {
    const ua = parseUserAgent(m.userAgent);
    return db
      .prepare(
        `INSERT INTO click_events (id, link_id, clicked_at, referrer, country, device_type, browser, os, batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      )
      .bind(m.clickId, m.linkId, m.clickedAt, m.referrerHost, m.country, ua.deviceType, ua.browser, ua.os, batchId);
  });

  const lastClickByLink = new Map<number, number>();
  for (const m of messages) {
    lastClickByLink.set(m.linkId, Math.max(lastClickByLink.get(m.linkId) ?? 0, m.clickedAt));
  }
  const updates = [...lastClickByLink].map(([linkId, lastClickAt]) =>
    db
      .prepare(
        `UPDATE links
            SET clicks = clicks + (SELECT count(*) FROM click_events WHERE batch_id = ? AND link_id = ?),
                last_click_at = max(coalesce(last_click_at, 0), ?)
          WHERE id = ?`,
      )
      .bind(batchId, linkId, lastClickAt, linkId),
  );

  await db.batch([...inserts, ...updates]);
}
