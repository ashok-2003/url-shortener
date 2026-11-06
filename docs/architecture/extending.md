# Where future features plug in

For each add-on in spec §14, this is where it goes, what has to change, and the trap to avoid. Read it before
starting one. If a feature changes the tRPC contract (spec §8), the owner approves it first.

## The layers

Most features touch one layer. Knowing which one tells you which files to open. `flows.md` has full diagrams of each
flow.

```
tRPC call ─► router ─► service ─► D1
             │          (src/server/links/service.ts: the business rules)
             │
             └─ input schema, own-host guard, rate limiter (in that order)

GET /{slug} ─► resolveRedirect ─► KV, then D1 on a miss ─► 302 / 404 / 410 ─► queue send (after the response)
               (src/server/redirect/resolve.ts)

queue batch ─► consumer ─► parse user agents ─► recordClicks: one D1 transaction
               (src/server/clicks/)
```

Files in `src/server/links/service.ts`, `src/server/redirect/` and `src/server/clicks/` are written in workstream C. Until
it lands, some of them are stubs.

## Features

### Real auth (Clerk)

- **Where:** `src/server/trpc/context.ts`. `ownerId` comes from the session instead of `DEMO_USER_ID`. Add a
  `protectedProcedure` that rejects calls with no session.
- **Why it's small:** every procedure already reads `ctx.ownerId` and never reads a user from input (AGENTS.md rule
  6), so nothing else changes. The redirect stays public.
- **Trap:** decide what happens to the `user_demo` links. Either migrate them to a real user or leave them as demo
  data.

### Edit, delete or disable a link

- **Contract:** new procedures (`links.update`, `links.disable`). This is a contract change, so it needs the owner's
  approval.
- **Schema:** add `disabled_at`. **Disable, don't hard-delete.** Click messages still in the queue point at the link,
  so a hard delete makes the consumer's insert fail its foreign key. The whole batch would then fail and retry until
  it lands in the dead-letter queue.
- **Redirect:** a disabled link answers `404`, the same as a link that never existed.
- **Cache:** every change deletes the KV key `link:{slug}`. Other locations may serve the old entry for 60 seconds or
  more (0002). Say so in the UI.

### Custom aliases

- **Contract:** an optional `alias` on `links.create`. A taken alias returns `CONFLICT` with `fieldErrors.alias`.
- **Routing:** aliases break the rule that a 7-character path can only be a slug (0006). They need their own pattern,
  a reserved-word list (`api`, `_next`, every top-level route and every file in `public/`), and an updated path matcher
  in both `resolveRedirect` and the `worker.ts` fast path.
- **Trap:** decide whether aliases are case-sensitive before shipping. Changing it later breaks links people have
  already shared.

### Malware and phishing check on create

- **Where:** the `links.create` chain, after the rate limiter: input → own-host guard → rate limiter → **safety
  check** → insert. Putting it after the limiter means nobody can burn our Safe Browsing or URL Scanner quota.
- **Cost:** it adds latency to creating a link, never to the redirect.
- **Decide first:** what happens if the scanning service is down. Failing open lets bad links in, and failing closed
  blocks every create.
- **Later:** a scheduled re-scan of existing links needs the "disable" feature above.

### Stamping our name on outgoing clicks (`utm_source`)

- **Schema:** a per-link `stamp_source` flag.
- **Redirect:** `resolveRedirect` adds the parameter when it builds `Location`, keeping any query the target already
  has.
- **Trap:** the flag must be in the KV value, and entries already cached don't have it. Treat a missing field as
  `false`, or change the key prefix (`link:v2:`) so old entries are simply never read.

### Bot and link-preview filtering; unique visitors

- **Bots:** the consumer's user-agent parser already writes `device_type = 'bot'`. Teach it the preview fetchers
  (Slackbot, Twitterbot, facebookexternalhit, WhatsApp, Discordbot), then have `links.stats` leave bots out.
  `links.clicks` still counts every hit unless we decide otherwise.
- **Unique visitors:** we store no IPs (AGENTS.md rule 10). The usual privacy-safe approach is a hash of IP, user
  agent and a secret salt that changes every day, computed in the redirect. The salt lives in KV and is replaced
  daily, so yesterday's hashes can't be linked to today's.

### Short negative caching for scanner traffic

- **Why it's safe here:** a slug is random and doesn't exist until it's created, so nobody can request it before it
  exists. A cached "not found" can therefore never hide a brand-new link. Custom aliases break this, because people
  choose them.
- **Where:** use the Cache API (per location) for misses, not KV. Every scanner probe would otherwise cost a KV write,
  and KV writes are the rate-limited operation (one per second per key).
- **Check first:** Cloudflare's docs say the Cache API works for Workers on custom domains, and say nothing either way
  about `*.workers.dev`. Test it on the address we actually deploy to. Each data centre keeps its own cache, so a miss
  cached in one city does nothing for another.

### Retention and daily roll-ups for `click_events`

- **Where:** a `scheduled()` export in `worker.ts` (a Cron Trigger) rolls finished days into a `daily_link_stats`
  table and deletes raw events older than the retention window.
- **Stats:** `links.stats` reads the roll-ups plus today's raw events. The contract doesn't change.

### D1 read replicas

See `docs/architecture/scaling.md`. They affect the redirect's D1 fallback and the `links.stats` queries.

### Custom domains

- **Schema:** a `domain` column on `links`, and slugs become unique per domain (index on `(domain, slug)`).
- **Cache:** the KV key gets the host: `link:{host}:{slug}`.
- **Other:** `shortUrl` uses the link's domain. The own-host guard must reject every domain we serve.

### Bulk create

- **Contract:** a new procedure taking an array.
- **Decide first:** how the rate limiter counts a batch. That's the owner's call.
- **Writes:** one `db.batch()` insert. Report which items failed instead of failing everything.

### Public API

- **Why REST is allowed here:** outside callers can't use tRPC's types, so REST is fine, and AGENTS.md rule 8 only
  covers internal calls. Keep the handlers thin: they call the same functions in `links/service.ts` as the tRPC router.
- **Auth:** API keys, stored hashed, with their own rate limit.

### A proper logging system (owner: planned)

- **Today:** `src/server/log.ts` writes one JSON line per event with `console.log`, `console.warn` or
  `console.error` (decision 0009). Workers Logs keeps them, but there's no search across days, no alerting and no
  tracing.
- **Next step:** keep the `log.info` / `log.warn` / `log.error` interface and change only `log.ts`:
  - add a request id (the `cf-ray` header) to every line, so one click can be followed from redirect to consumer;
  - send logs to a drain (Workers Logpush, or a provider such as Axiom, Better Stack or Sentry for errors);
  - add alerts on `click.send_failed`, `d1.read_failed` and `clicks-dlq` depth.
- **Trap:** never start logging IP addresses or full referrer URLs. AGENTS.md rule 10 applies to logs too.

### QR codes and dark mode

Frontend only. A QR code is drawn in the browser from `shortUrl`. Neither touches the backend.
