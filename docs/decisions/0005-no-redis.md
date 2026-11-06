# 0005. No Redis

- **Status:** Accepted
- **Date:** 2026-11-06
- **Spec:** §3

## Context

Many URL shortener designs put Redis in front of the database for three jobs: caching slug lookups, counting clicks,
and rate limiting. Reviewers will expect us to say why we don't.

## Decision

No Redis. Each of its usual jobs already has a home on the platform we deploy to:

| Job                  | Where it lives here                                                  |
| -------------------- | -------------------------------------------------------------------- |
| Slug lookup cache    | Workers KV, read-through (0002)                                      |
| Click counting       | Queue, then batched D1 writes (0003)                                 |
| Rate limiting        | Ashok's design (spec §9): D1, or a Durable Object if it has to be strict at high volume |

## Why not the alternatives

- **A hosted Redis (for example Upstash) called from Workers:** another service, another bill, another credential and
  another thing that can go down, reached over the network from every location. It would duplicate what KV, Queues
  and D1 already do here.

## Consequences

- Fewer moving parts to run, explain and test.
- Click counts aren't real-time. They lag by a few seconds, which the owner accepted.

## Revisit when

We need real-time counters or exact limits at a volume that D1 can't carry. Even then, a Durable Object is the
platform's answer before Redis.
