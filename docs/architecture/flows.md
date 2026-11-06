# How the app flows

These diagrams were drawn from the approved spec and checked against the foundation plan. **The spec wins:** if a
diagram disagrees with it, fix the diagram. GitHub renders the mermaid blocks.

## 1. Overview

```mermaid
flowchart LR
  U["Browser (phone or desktop)"]
  subgraph W["One Cloudflare Worker: worker.ts is Wrangler's main"]
    F["fetch()"]
    FP{"Path is 7 letters or digits?"}
    RR["resolveRedirect()"]
    NX["Next.js app through OpenNext: pages and tRPC at /api/trpc"]
    QC["queue() consumer: recordClicks()"]
  end
  KV[("KV LINKS_CACHE: slug to link")]
  D1[("D1 DB: links, click_events")]
  Q[["Queue CLICKS"]]
  DLQ[["clicks-dlq, no consumer"]]
  U -->|"GET /abc1234"| F
  U -->|"page loads and tRPC calls"| F
  F --> FP
  FP -->|"yes: fast path, kept only if measured faster"| RR
  FP -->|"no"| NX
  NX -->|"app/[slug]/route.ts: for next dev, and fallback"| RR
  RR -->|"read first"| KV
  RR -->|"on a miss"| D1
  RR -.->|"fill after a miss, after the response"| KV
  RR -.->|"after the response"| Q
  NX -->|"create, list, stats"| D1
  Q -->|"batches"| QC
  QC -->|"one batch transaction"| D1
  Q -.->|"after max retries"| DLQ
```

## 2. Create a link

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Form as CreateLinkForm (client)
  participant T as tRPC links.create
  participant Z as Zod input check
  participant G as Own-host guard
  participant RL as rateLimitCreate (owner builds)
  participant S as Link service
  participant DB as D1
  User->>Form: paste an https URL, pick an expiry
  Form->>Form: same Zod schema checks it first
  Form->>T: POST /api/trpc (userId comes from context, never from input)
  T->>Z: URL rules and expiry rules
  alt invalid
    Z-->>Form: BAD_REQUEST with fieldErrors (does not count toward the limit)
  end
  T->>G: is the target one of our own short links?
  alt own host
    G-->>Form: BAD_REQUEST with fieldErrors.url (does not count toward the limit)
  end
  T->>RL: middleware runs after the input check and the guard
  alt 6th create within 60 s
    RL-->>Form: TOO_MANY_REQUESTS with retryAfterSeconds (live countdown)
  end
  RL->>S: next()
  loop up to 3 random slugs
    S->>DB: INSERT link (slug has a unique index)
  end
  S-->>Form: LinkSummary (shortUrl, clicks 0)
  Form->>Form: show Copy and Share, refresh links.list
```

## 3. Redirect

```mermaid
flowchart TD
  A["Request for /abc1234"] --> B{"Exactly 7 letters or digits?"}
  B -->|"no"| N1["Normal 404, no storage touched"]
  B -->|"yes"| C{"KV get link:slug"}
  C -->|"hit"| E{"Expired? Checked on every request"}
  C -->|"miss"| D{"D1 SELECT by slug"}
  D -->|"not found"| N2["Branded 404. Not-found is never cached"]
  D -->|"query failed"| U5["503 with Retry-After: 5, unavailable page. We couldn't check, so we don't claim it's missing"]
  D -->|"found"| E
  D -.->|"also, after the response"| F["Fill KV: TTL is the smaller of 7 days and time to expiry, at least 60 s"]
  E -->|"yes"| X["410: This link has expired"]
  E -->|"no"| R["302 to the target. Cache-Control: private, no-store. Server-Timing: kv, d1, total"]
  R -.->|"after the response, GET only, not HEAD"| Q[["Queue CLICKS: clickId, linkId, time, referrer host, country, user agent"]]
```

## 4. Click pipeline

```mermaid
sequenceDiagram
  participant R as Redirect (already sent the 302)
  participant Q as Queue CLICKS
  participant C as queue() consumer
  participant DB as D1
  R->>Q: send the click message (in waitUntil)
  Note over Q: waits for 100 messages or 5 seconds
  Q->>C: a batch of up to 100
  C->>C: parse user agents (device, browser, OS), make a new batchId
  C->>DB: one batch, run as a single transaction
  Note over DB: 1. INSERT every event, ON CONFLICT(id) DO NOTHING, tagged with batchId<br/>2. Per link: clicks = clicks + (rows inserted with this batchId)
  alt transaction succeeded
    C->>Q: ack
  else failed
    Q->>C: redeliver later. Rows already stored are skipped, so nothing is counted twice
    Q->>Q: after the retry limit, move to clicks-dlq
  end
  Note over R,DB: Under next dev there is no consumer: a dev-only fallback calls recordClicks() directly in waitUntil
```

## 5. List and link details

```mermaid
sequenceDiagram
  participant P as page.tsx (Server Component)
  participant RT as tRPC router
  participant L as LinkList (client)
  participant S as LinkDetailSheet (client)
  participant DB as D1
  P->>RT: prefetch links.list in-process (no HTTP call to itself)
  RT->>DB: my links, newest first, cursor is the id
  P-->>L: server-rendered HTML plus HydrationBoundary
  L->>RT: Load more (next cursor) through /api/trpc
  L->>S: tap a row: URL gets ?link=slug
  S->>RT: links.stats(slug)
  RT->>DB: totals (all, 24 h, 7 d), 30 daily counts, top 5 referrers, top 5 countries, devices
  Note over RT: Someone else's slug returns NOT_FOUND, so ownership is never revealed
```

## 6. Data model

```mermaid
erDiagram
  links ||--o{ click_events : "has"
  links {
    integer id PK "internal, also the list cursor"
    text slug UK "7 chars, base62"
    text target_url "https only, max 2048"
    text owner_id "from context"
    integer clicks "only the consumer updates it"
    integer created_at "ms"
    integer expires_at "null = never"
    integer last_click_at "nullable"
  }
  click_events {
    text id PK "clickId, the idempotency key"
    integer link_id FK
    integer clicked_at "time of the redirect"
    text referrer "host only"
    text country "from request.cf"
    text device_type "mobile, tablet, desktop, bot, unknown"
    text browser
    text os
    text batch_id "the consumer run"
  }
```

Indexes: `links(owner_id, id)`; `click_events(link_id, clicked_at)` and `click_events(batch_id, link_id)`. No IP
addresses are stored.
