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

- **A fixed-window counter** (one count per minute bucket): it allows about 10 creates within a second across a bucket
  boundary. The sliding window has no boundary to exploit.
- **An in-memory counter:** Workers share nothing. Each isolate would have its own count, so the limit would be wrong.
- **Cloudflare's Rate Limiting binding:** it can't give a slot back, so "only successful creates count" is impossible
  with it, and its period is only 10 or 60 seconds. It is also approximate and counts per location.
- **A Durable Object:** strict and fast, but it needs extra wiring under `next dev`. It is the swap behind the
  `RateLimiter` interface if load grows.
- **Counting rows in `links`:** a naive count-then-insert lets a burst through, because the count and the insert are
  separate steps. Making it atomic means folding the count into the create's own INSERT, which goes past the spec §9
  seam and tangles with slug retries.

## Consequences

- Exact, atomic, no new infrastructure, and it works the same under `next dev` and in workerd.
- The cost is one D1 write per create attempt, plus one more when a failed create releases its slot.
- A slot is held while the create runs. A create that later fails can briefly limit a concurrent request. That is the
  price of never going over 5.
- "Exact" is measured on the Worker's request timestamps. `retryAfterSeconds` is clamped to 1..60, because requests
  that reach D1 out of order can leave rows stamped slightly after the caller's `now`.
- The oldest-slot read is in the same batch (same transaction) as the insert, so a limited caller always gets a real wait.
- Pruning is inside `acquire` and removes rows older than twice the window, so a later-stamped request never deletes a
  row an earlier-stamped one still counts. No cleanup job is needed.

## Revisit when

Many users create at high volume and the D1 write becomes the bottleneck. Then use a Durable Object per user behind
the same `RateLimiter` interface.
