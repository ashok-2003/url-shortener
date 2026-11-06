import "server-only";
import { RATE_LIMIT } from "@/server/config";

export type Acquired =
  | { ok: true; slotId: string }
  | { ok: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Takes one slot for `ownerId` if fewer than the limit are held in the window ending at `now` (ms). */
  acquire(ownerId: string, now: number): Promise<Acquired>;
  /** Gives a slot back, so a create that failed does not count. */
  release(slotId: string): Promise<void>;
}

/**
 * Exact sliding window in D1 (decision 0010). Each create attempt holds one row in
 * `rate_limit_events`; rows older than the window are ignored and pruned.
 * No module-level state: Workers share nothing between requests, D1 is the shared memory.
 */
export function d1RateLimiter(db: D1Database, rule = RATE_LIMIT): RateLimiter {
  return {
    async acquire(ownerId, now) {
      const windowStart = now - rule.windowMs;
      const slotId = crypto.randomUUID();

      // One batch = one D1 transaction. D1 runs one query at a time, so the count check and the
      // insert cannot interleave with another request: a burst can never take more than the limit.
      const [, insert] = await db.batch([
        db
          .prepare("DELETE FROM rate_limit_events WHERE owner_id = ? AND created_at <= ?")
          .bind(ownerId, windowStart),
        db
          .prepare(
            `INSERT INTO rate_limit_events (id, owner_id, created_at)
             SELECT ?, ?, ?
              WHERE (SELECT count(*) FROM rate_limit_events WHERE owner_id = ? AND created_at > ?) < ?
             RETURNING id`,
          )
          .bind(slotId, ownerId, now, ownerId, windowStart, rule.createsPerWindow),
      ]);

      if (insert.results.length > 0) return { ok: true, slotId };

      // Limited: the oldest slot in the window is the first to expire.
      const oldest = await db
        .prepare("SELECT min(created_at) AS oldest FROM rate_limit_events WHERE owner_id = ? AND created_at > ?")
        .bind(ownerId, windowStart)
        .first<{ oldest: number | null }>();
      // `oldest` is null only if every row expired between the two statements; wait the minimum.
      const expiresAt = (oldest?.oldest ?? now) + rule.windowMs;
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)) };
    },

    async release(slotId) {
      await db.prepare("DELETE FROM rate_limit_events WHERE id = ?").bind(slotId).run();
    },
  };
}
