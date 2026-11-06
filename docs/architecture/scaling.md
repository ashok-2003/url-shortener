# Scaling: what breaks first, and the next step

The owner's bar: **the app never goes down and never feels slow. Analytics may lag, because it's for auditing.** v1
meets that by design: a redirect does one read (KV, or D1 on a miss), and every write happens after the response. This
note lists the limits we will hit, in order, how to see each one coming, and the next step for each. None of the next
steps is built in v1.

Platform numbers were checked against developers.cloudflare.com on 2026-11-06 (sources at the bottom). Our own
estimates are marked **estimate**. Measure them before acting on them.

## Where the load goes

| Traffic        | Path                                 | Writes                                    |
| -------------- | ------------------------------------ | ----------------------------------------- |
| Click, hot link | Worker → KV hit → `302`             | One queue message, after the response     |
| Click, cold link | Worker → KV miss → D1 read → `302` | One KV fill + one queue message, after    |
| Queue batch    | Consumer → one `db.batch()`          | Up to 100 inserts + one update per link   |
| Create         | tRPC → D1 insert                     | One row. Rate limited to 5/min per user   |
| Dashboard      | tRPC → D1 reads                      | None                                      |

Clicks are almost all of the load, and a click's only D1 cost is in the consumer. D1 is also where click writes,
cold-link reads and dashboard reads compete, because **a D1 database runs one query at a time.**

## Limits, in the order we expect to hit them

### 1. D1 gets busy with click writes

- **Why first:** throughput is `1 / average query time`. It's 1,000 queries/s at 1 ms, and 10/s at 100 ms. When too
  many queries wait, D1 returns "overloaded" errors. Every inserted click is one statement.
- **What it looks like:** the queue backlog grows and counts lag further behind. Cold-link redirects and the dashboard
  slow down, because they wait behind the writes. Then "overloaded" errors appear, batches retry, and after 3 retries
  the clicks go to `clicks-dlq`.
- **Watch:** queue backlog, consumer errors, `clicks-dlq` depth, D1 query duration.
- **Next steps, cheapest first:**
  1. **Cap consumer concurrency.** Queues can run up to 250 consumers at once. Against a database that runs one query
     at a time, more consumers add contention, not throughput. Set `max_concurrency` low in `wrangler.jsonc`.
  2. **Bigger batches:** the maximum `max_batch_size` is 100 (already set). A longer `max_batch_timeout` (up to 60 s)
     fills batches when traffic is light. Counts lag more, which the owner allows.
  3. **Move per-click events to Workers Analytics Engine, and keep only the counters in D1.** The redirect writes one
     data point per click with `writeDataPoint`. It doesn't wait for anything, and no queue is involved. Index by link
     id. The consumer then does one `UPDATE` per link per batch and no inserts. The charts read from Analytics Engine's
     SQL API. **Trade:** its data is sampled at high volume, so chart numbers become estimates (queries must weight by
     `_sample_interval`), and it keeps data for 3 months.
  4. **Split across several D1 databases** (by owner, for example). An account can have up to 1,000,000. This is the
     last resort, because every query then has to know which database to ask.

### 1b. `analytics.overview` aggregates on every request

- **Why:** it scans every one of the owner's `click_events` rows in the last 30 days, plus their links, on each page
  load. That's the second D1 hot spot after click writes, and it competes for the same single thread.
- **What it looks like:** the Analytics tab slows down as one owner's clicks grow, and so does everything else
  waiting on D1 while it runs.
- **Next step:** a `daily_link_stats` roll-up table, filled by a Cron Trigger (`docs/architecture/extending.md`). The
  overview then reads 30 rows per link instead of every click. A short per-owner cache in KV (60 s) is a cheaper
  step in between, because the UI already says counts lag by a few seconds.

### 2. One queue takes at most 5,000 messages per second

- **What it looks like:** above that, `CLICKS.send()` throws "Too Many Requests". The redirect is unaffected, because
  the send happens after the response, but those clicks are lost.
- **Next steps:** step 3 above removes the queue from the per-click path. Otherwise, spread sends across several
  queues, chosen by hashing `clickId`, all with the same consumer code.

### 3. D1's 10 GB cap

- **Facts:** 10 GB per database on the paid plan, and it **cannot be raised**.
- **Estimate:** a `click_events` row with its indexes is roughly 300 bytes, so 10 GB holds roughly 30 million clicks.
  `links` rows are tiny next to that.
- **Next steps:** retention plus daily roll-ups (`docs/architecture/extending.md`), or step 3 above, which moves events
  out of D1 entirely.

### 4. First clicks far from the database

- **What it looks like:** a cold link clicked far from D1's primary pays one long round trip.
- **Next step:** D1 read replication (public beta in the release notes; we found no GA notice). It needs code changes:
  queries must go through `db.withSession()`.
- **Trap:** a session that doesn't start on the primary may read from a replica that hasn't seen a just-created link
  yet. That would turn "a link works the moment it's created" into a 404. The redirect's fallback must start its
  session with `"first-primary"`, or retry on the primary when a replica finds nothing.

## Staying up when a dependency fails

These are rules for workstream C, not future work.

Every row below logs through `src/server/log.ts` (decision 0009). Nothing fails silently.

| If this fails            | The redirect must                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------- |
| A binding is missing     | Throw `ConfigError` on the first request. That's a deploy mistake, and it must be loud.  |
| KV read                  | Log `kv.read_failed` and fall through to D1. A KV problem must never become an error page. |
| KV write (cache fill)    | Log `kv.fill_failed` as a warning and move on. KV allows **1 write per second per key**, so a new link going viral will see `429`s. It's only a cache. |
| D1 read                  | Answer **`503`** with `Retry-After: 5` (0008). Never `404`: we don't know the link is missing. Links already in KV keep working. |
| `CLICKS.send()`          | Log `click.send_failed` as an error. The visitor has already been redirected. The click is lost, and we accept that (0003). |
| The consumer             | Log `click.record_failed` and rethrow. The batch is retried 3 times, then goes to `clicks-dlq`. A malformed message is logged (`click.bad_message`) and retried too, so it ends in the DLQ instead of being deleted. Messages there are kept for the queue's retention period (4 days by default on the paid plan, up to 14), then deleted. v1 has no DLQ consumer. Replaying it is a manual step to add before launch. |

## Platform facts the code must respect

- **D1: at most 100 bound parameters per query.** A multi-row insert of 100 click events (9 columns each) would need
  900. Use one `INSERT` statement per event inside a single `db.batch()`. A batch counts as one query against the
  1,000-queries-per-invocation limit.
- **D1: `db.batch()` is a transaction.** If any statement fails, the whole batch rolls back.
- **KV: a write can take 60 seconds or more to show up in other locations.** The minimum `expirationTtl` is 60 s, and
  the minimum `cacheTtl` on reads is 30 s.
- **KV on the free plan: 1,000 writes a day, and every write past that fails.** A cache fill happens once per clicked
  link per 7 days, so this caps us at about 1,000 newly clicked links a day. After that, fills fail (and are ignored),
  and cold links are read from D1 every time. The paid plan includes 1 million writes a month.
- **Queues deliver at least once,** so the consumer must be idempotent (0003). The default is 3 retries, then the
  dead-letter queue. With no DLQ configured, the messages would be deleted.
- **Queues: we found no docs that say `send()` inside `ctx.waitUntil` is supported.** Spec §12's integration test ("the
  click is enqueued, and the response doesn't wait for it") must prove it in `workerd`.
- **Rate limiting:** Cloudflare's Rate Limiting binding is approximate and counts per location, so it can't enforce
  "exactly 5 per minute". Cloudflare's docs point to Durable Objects for strict limits, using one object per natural
  boundary such as the user, never one global object. (Rate limiting is Ashok's design; spec §9.)

## How to measure before acting

- Use `pnpm preview` locally for redirect latency (`Server-Timing` header, spec §6).
- For write throughput, load-test a deployed preview: send a steady stream of clicks, then watch queue backlog and D1
  query duration. The breaking point is when the backlog keeps growing. Record the numbers here.

## Sources (checked 2026-11-06)

- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 batch and sessions: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 read replication: https://developers.cloudflare.com/d1/best-practices/read-replication/
- KV: https://developers.cloudflare.com/kv/concepts/how-kv-works/, https://developers.cloudflare.com/kv/platform/limits/
- Queues: https://developers.cloudflare.com/queues/platform/limits/,
  https://developers.cloudflare.com/queues/configuration/batching-retries/,
  https://developers.cloudflare.com/queues/configuration/consumer-concurrency/
- Analytics Engine: https://developers.cloudflare.com/analytics/analytics-engine/limits/,
  https://developers.cloudflare.com/analytics/analytics-engine/sampling/
- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Rate Limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
