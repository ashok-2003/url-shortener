# 0003. Clicks go through a Queue and are counted once

- **Status:** Accepted
- **Date:** 2026-11-06
- **Spec:** §5, §7

## Context

- Every click must be recorded with its time, referrer, country and device.
- The redirect must never wait on a write.
- The owner said analytics is for auditing and may lag, but the app must never go down or feel slow.
- Counts must not drift: a click must not be counted twice or dropped by a retry.

## Decision

1. **Producer.** After sending the `302`, the redirect calls `env.CLICKS.send(...)` inside `ctx.waitUntil`. The
   message is `{ clickId, linkId, clickedAt, referrerHost, country, userAgent }`. `clickId` is a fresh UUID. `HEAD`
   requests aren't clicks and aren't sent.
2. **Consumer.** The `queue()` export of the same Worker gets batches of up to 100 messages, or whatever arrived within
   5 seconds. It parses each user agent, makes one `batchId`, and in **one `db.batch()`** (a single transaction):
   - inserts every event with `ON CONFLICT(id) DO NOTHING`, tagged with `batchId`;
   - for each link in the batch, adds to `links.clicks` the number of rows **this batch actually inserted**
     (`WHERE batch_id = ? AND link_id = ?`).
3. **Retries.** Failed batches are retried, and then go to the dead-letter queue `clicks-dlq`.

## Why not the alternatives

- **Write to D1 straight from the redirect's `waitUntil`:** one write per click to a database that runs one query at a
  time, with no batching. A failure is lost quietly, and a retry could count twice.
- **Keep only a counter:** no charts by referrer, country or device, which the owner wants.
- **Add the number of messages in the batch:** a redelivered batch would be counted again. Counting the rows the
  insert kept is what makes a retry harmless.
- **Workers Analytics Engine now:** cheaper at high volume, but its data is sampled and can't be joined with `links`
  in SQL, and it's one more thing to explain. It's the documented next step (`docs/architecture/scaling.md`).

## Consequences

- Counts lag by up to the batch timeout (5 s) plus queue delay. The UI says "Counts update within a few seconds."
- Queues deliver at least once, and the `batchId` trick turns that into counted exactly once.
- D1 sees one `UPDATE` per link per batch, not one per click.
- `links.clicks` and `click_events` are written in the same transaction, so they always agree.
- **D1 allows 100 bound parameters per query,** so the events are one `INSERT` statement each inside the batch, not
  one multi-row insert.
- **One queue accepts at most 5,000 messages per second.** Above that, sends fail and those clicks are lost. That's
  the second limit in `docs/architecture/scaling.md`.
- **What we accept:** if `CLICKS.send()` itself fails, that click is lost. The visitor is still redirected, and the
  loss is logged as an error (`click.send_failed`, decision 0009), so it's never silent.
- **A malformed message is retried, not acked,** so it ends up in `clicks-dlq` where it can be inspected. It is logged
  as `click.bad_message`.
- `next dev` runs no queue consumer, so local development needs a fallback that calls `recordClicks()` directly
  (spec §7).

## Revisit when

- Click volume keeps D1 busy: move per-click events to Analytics Engine and keep only counters in D1.
- `click_events` grows large: add retention and daily roll-ups (spec §14).
