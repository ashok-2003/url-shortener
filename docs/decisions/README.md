# Decision records

One short file per backend choice: what we decided, why, what we turned down, and when to look at it again. The spec
(`docs/superpowers/specs/2026-11-06-url-shortener-design.md`) says **what** the system does. These files say **why**.
If they disagree, the spec wins, and the record gets fixed.

Read the one you need before you change the thing it covers. If you want to go against one, write a new record that
replaces it instead of editing the old one, and change the old one's status to "Replaced by NNNN".

## Index

| #                                         | Decision                                                         | Status   |
| ----------------------------------------- | ---------------------------------------------------------------- | -------- |
| [0001](0001-d1-source-of-truth.md)        | D1 is the source of truth                                        | Accepted |
| [0002](0002-kv-read-through-cache.md)     | KV is a read-through cache that never caches "not found"         | Accepted |
| [0003](0003-clicks-through-a-queue.md)    | Clicks go through a Queue and are counted once                   | Accepted |
| [0004](0004-302-no-store.md)              | Redirects are `302` with `no-store`, never `301`                 | Accepted |
| [0005](0005-no-redis.md)                  | No Redis                                                         | Accepted |
| [0006](0006-random-slugs.md)              | Slugs are 7 random base62 characters                             | Accepted |
| [0007](0007-one-worker.md)                | One Worker serves everything; the redirect fast path must be measured | Proposed |
| [0008](0008-503-when-d1-fails.md)         | A redirect answers `503` when D1 fails, never `404`              | Accepted |
| [0009](0009-fail-loud-one-config-one-logger.md) | Fail loud, one config module, one logger                   | Accepted |
| —                                         | Rate limiting                                                    | Ashok writes this one (spec §9) |

"Accepted" means accepted in the spec (approved by the owner on 2026-11-06), or approved by the owner directly.

## Template

```markdown
# NNNN. Title in plain words

- **Status:** Proposed | Accepted | Replaced by NNNN
- **Date:** YYYY-MM-DD
- **Spec:** §n

## Context
What problem forced a choice. Facts only.

## Decision
What we do, in a few sentences.

## Why not the alternatives
One line per option we turned down, and why.

## Consequences
What gets easier, what gets harder, and what we accept.

## Revisit when
The signal that should make someone reopen this.
```
