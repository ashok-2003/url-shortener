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
      // Pruning keeps 2x the window, so a request stamped slightly later never deletes a row that an
      // earlier-stamped request still counts. The third statement reads the oldest slot in the same
      // transaction, so it is never empty when the caller is limited.
      const [, insert, oldest] = await db.batch([
        db
          .prepare("DELETE FROM rate_limit_events WHERE owner_id = ? AND created_at <= ?")
          .bind(ownerId, now - 2 * rule.windowMs),
        db
          .prepare(
            `INSERT INTO rate_limit_events (id, owner_id, created_at)
             SELECT ?, ?, ?
              WHERE (SELECT count(*) FROM rate_limit_events WHERE owner_id = ? AND created_at > ?) < ?
             RETURNING id`,
          )
          .bind(slotId, ownerId, now, ownerId, windowStart, rule.createsPerWindow),
        db
          .prepare("SELECT min(created_at) AS oldest FROM rate_limit_events WHERE owner_id = ? AND created_at > ?")
          .bind(ownerId, windowStart),
      ]);

      if (insert.results.length > 0) return { ok: true, slotId };

      // Limited: the oldest slot in the window is the first to expire. Rows stamped after `now`
      // (out-of-order requests, clock skew) can make that later than a full window, so clamp.
      const oldestAt = (oldest.results[0] as { oldest: number | null } | undefined)?.oldest;
      if (oldestAt === null || oldestAt === undefined) return { ok: false, retryAfterSeconds: 1 };
      const maxWait = Math.ceil(rule.windowMs / 1000);
      const wait = Math.ceil((oldestAt + rule.windowMs - now) / 1000);
      return { ok: false, retryAfterSeconds: Math.min(maxWait, Math.max(1, wait)) };
    },

    async release(slotId) {
      await db.prepare("DELETE FROM rate_limit_events WHERE id = ?").bind(slotId).run();
    },
  };
}
