# 0002. KV is a read-through cache that never caches "not found"

- **Status:** Accepted
- **Date:** 2026-11-06
- **Spec:** §6

## Context

The redirect is the hot path, and it must feel instant everywhere. D1 lives in one place (0001), so a reader far from
it pays a round trip. A link must also work the moment it is created.

## Decision

- The redirect reads KV key `link:{slug}`, which holds `{ id, targetUrl, expiresAt }`.
- On a miss it reads D1. When D1 finds the link, the redirect answers first and fills KV afterwards (`waitUntil`).
- **"Not found" is never cached.** A KV miss always falls through to D1.
- **Expiry is checked on every request,** cached or not, so a cached entry can't outlive its link.
- An entry lives for the shorter of 7 days and the time left until the link expires, but at least 60 seconds (the KV
  minimum).

## Why not the alternatives

- **Write KV when the link is created (write-through):** a KV write takes time to reach other locations, so a click
  right after creation may still miss, and we need the D1 fallback anyway. This would add a second write to every
  create without removing anything.
- **Caching "not found":** a link created after a miss would 404 until the cached miss expires. That's one of the
  spec's anti-goals.
- **Caching the `302` in Cloudflare's CDN cache:** a cached redirect never reaches the Worker, so the click isn't
  counted (0004).
- **Caching in the Worker's memory:** isolates share nothing and disappear at any time. That breaks rule 1 in
  `AGENTS.md`.

## Consequences

- In v1 a cached entry is never wrong, because links can't be edited.
- **When edit or delete is added,** it must delete the KV key, and other locations may keep serving the old entry for
  60 seconds or more while the delete spreads.
- Requests for slugs that don't exist (scanners, typos) always reach D1.
- **A failed cache fill is logged as a warning (`kv.fill_failed`) and doesn't affect the visitor.** KV allows one
  write per second per key, so a new link going viral will get `429`s on the fill. The redirect has already answered
  by then.
- **A failed KV read is logged as an error (`kv.read_failed`) and falls through to D1.** The cache must never be the
  reason a redirect fails (0009).

## Revisit when

- Edit, delete or disable is built: add the KV delete, and decide whether a minute of staleness is acceptable.
- Scanner traffic shows up as D1 load: add a short negative cache (spec §14).
