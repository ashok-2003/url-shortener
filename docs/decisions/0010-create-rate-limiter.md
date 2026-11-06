# 0010. The create rate limiter is an exact sliding window in D1

- **Status:** Accepted. Ashok designed it (ruling S1).
- **Date:** 2026-11-06
- **Spec:** §9

## Context

A user may create at most 5 links in any 60 seconds. The brief makes this a core requirement, so it has to be exact:
a burst of 10 requests at once must get 5 links, not 6. Workers share nothing between requests, so the count has to
live somewhere shared.

## Decision

Every create attempt takes a slot: one row in `rate_limit_events` (`id`, `owner_id`, `created_at` in ms). The limiter
lives in `src/server/links/rate-limiter.ts`; the middleware that uses it is `rate-limit.ts`. The numbers are in
`RATE_LIMIT` in `src/server/config.ts`.

- `acquire(ownerId, now)` runs one `db.batch()`, which D1 runs as one transaction: delete this owner's rows older than
  the window, then insert a new row only if fewer than 5 rows are in the window. D1 runs one query at a time, so the
  check and the insert cannot interleave. A concurrent burst can never get more than 5 slots.
- If nothing was inserted, the caller is limited. The wait is when the oldest slot in the window expires:
  `max(1, ceil((oldest + windowMs - now) / 1000))` seconds. It reaches the browser as `error.data.retryAfterSeconds`.
- The middleware sits after input validation and the own-host guard, so those rejections never take a slot.
- **Only successful creates count.** If the create fails, the middleware calls `release(slotId)` and the row is
  deleted. If the release itself fails, it logs `ratelimit.release_failed` and returns the create's own error.
- The limiter keeps no state in memory. It is built per request from `ctx.env.DB`.

## Why not the alternatives

- **An in-memory counter:** Workers share nothing. Each isolate would have its own count, so the limit would be wrong.
- **Cloudflare's Rate Limiting binding:** it is approximate and counts per location. It cannot promise "exactly 5".
- **A Durable Object:** strict and fast, but it needs extra wiring under `next dev`. It is the swap behind the
  `RateLimiter` interface if load grows.
- **Counting rows in `links`:** it would bypass the spec §9 seam, and it would tie the limiter to the links table.
  It would also count the wrong thing if links are ever deleted.

## Consequences

- Exact, atomic, no new infrastructure, and it works the same under `next dev` and in workerd.
- The cost is one D1 write per create attempt, plus one more when a failed create releases its slot.
- Pruning happens inside `acquire`, so the table stays small without a cleanup job.

## Revisit when

Many users create at high volume and the D1 write becomes the bottleneck. Then use a Durable Object per user behind
the same `RateLimiter` interface.
