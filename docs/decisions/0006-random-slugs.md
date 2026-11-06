# 0006. Slugs are 7 random base62 characters

- **Status:** Accepted
- **Date:** 2026-11-06
- **Spec:** §6

## Context

A slug has to be short, unique and impossible to guess. It also must never collide with the app's own routes.

## Decision

- 7 characters from `A-Z a-z 0-9`, generated with `crypto.getRandomValues`.
- **Rejection sampling:** bytes of 248 and above are thrown away, so every character is equally likely. 248 is the
  largest multiple of 62 below 256.
- The unique index on `links.slug` catches collisions. `create` retries with a fresh slug up to 3 times.
- **Routing rule:** no top-level app route may be exactly 7 letters and digits. A path like `/aZ09xYz` can therefore
  only be a slug, and no reserved-word list is needed.

## Why not the alternatives

- **A hash of the URL:** two users shortening the same URL would get the same slug and share click counts. A
  shortened hash can still collide, and we still need a lookup either way.
- **Encoded sequential ids (base62 of `id`):** anyone can walk through every link, and the slugs reveal how many links
  exist.
- **`Math.random()`:** it isn't cryptographically random, so the next slug could be predictable.
- **Plain `% 62` on a random byte:** 256 isn't a multiple of 62, so some characters would come up more often.

## Consequences

- There are 62⁷ ≈ 3.5 trillion slugs. Even with a million links, a new slug collides about 3 times in 10 million
  tries, so three collisions in a row won't happen in practice.
- Slugs are case-sensitive, so the database compares them byte for byte (SQLite's default `BINARY` collation).

## Revisit when

Custom aliases are added (spec §14). They break the routing rule, because a user could pick an alias like `pricing`,
so they need their own character rules, a reserved-word list and a "taken" error.
