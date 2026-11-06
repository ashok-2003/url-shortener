# 0001. D1 is the source of truth

- **Status:** Accepted
- **Date:** 2026-11-06
- **Spec:** §3, §5

## Context

We store two things:

- **Links.** We look them up by slug, need slugs to be unique, and list a user's links newest first, page by page.
- **Click events.** We group them by link and by day, referrer, country and device for the charts.

The app runs on Cloudflare Workers, which share no memory between requests, so all state has to live in a storage
service. Cloudflare is the hiring team's production stack.

## Decision

Cloudflare D1 (SQLite), accessed through Drizzle ORM, holds every link and every click event. Everything else (the KV
cache, queue messages) is derived from it or on its way into it.

## Why not the alternatives

- **KV as the main store:** it's eventually consistent and has no unique constraint, so two creates could take the
  same slug. It also can't answer "my links, newest first" or "clicks per day".
- **Durable Objects with SQLite storage:** strong and fast, but we would have to decide how to split data across
  objects and route requests to them. v1 doesn't need that, and it's harder to explain on a video.
- **External Postgres through Hyperdrive:** another service, another credential and another network hop, and nothing
  in v1 needs a feature only Postgres has.

## Consequences

- We get SQL, a unique index on `slug`, and transactions through `db.batch()`.
- Drizzle gives a typed schema and generated migrations in `drizzle/`.
- **One database runs one query at a time, so writes are the first ceiling.** The click pipeline (0003) batches
  writes to delay it. `docs/architecture/scaling.md` lists the next steps.
- The database lives in one place. Reads from far away pay a round trip, which is why the redirect reads KV first
  (0002).

## Revisit when

- Click writes keep the database busy. The next step is moving per-click events out of D1.
- The database gets close to its size limit.
