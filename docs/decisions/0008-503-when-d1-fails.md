# 0008. A redirect answers `503` when D1 fails, never `404`

- **Status:** Accepted. Ashok approved it on 2026-11-06.
- **Date:** 2026-11-06
- **Spec:** §6 (adds a case the spec didn't cover)

## Context

On a KV miss the redirect asks D1. The spec says what to do when D1 finds nothing (`404`), but not when the D1 query
itself fails: an outage, an "overloaded" error, a timeout. If that failure fell through to "not found", a working
link would tell the visitor it doesn't exist.

## Decision

| Situation                         | Answer                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Found and live                    | `302` (0004)                                                                    |
| Not in D1                         | `404`, "This link doesn't exist"                                                |
| Expired                           | `410`, "This link has expired"                                                  |
| **The D1 query throws**           | **`503`**, `Retry-After: 5`, `Cache-Control: private, no-store`, and the "We couldn't open this link right now" page with a "Try again" button that reloads the same URL |

- The page comes from `renderStatusPage("unavailable", { homeUrl, retryUrl: request.url })`. Workstream B owns its
  copy and its look.
- A KV hit still redirects during a D1 outage, because the cached entry carries `expiresAt`, so expiry can be checked
  without D1.
- No click is enqueued for a `503`.

## Why not the alternatives

- **`404`:** tells the visitor the link doesn't exist when we don't know that. They give up on a link that works.
- **`500`:** says "we broke" with no hint to retry. `503` with `Retry-After` is the standard way to say "temporarily
  unavailable, try again shortly".
- **A longer `Retry-After`:** most D1 failures we expect (an overloaded queue, a brief blip) clear within seconds,
  and a person is waiting.

## Consequences

- During a D1 outage, every link already in KV keeps working, and only cold links show the `503` page.
- The redirect needs one `try`/`catch` around the D1 read. A KV failure is different: it falls through to D1 (0002).

## Revisit when

D1 read replicas are added (`docs/architecture/scaling.md`): a replica could answer when the primary can't.
