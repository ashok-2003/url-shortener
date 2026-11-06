# 0007. One Worker serves everything; the redirect fast path must be measured

- **Status:** Proposed. It waits on the latency measurement in spec §4.
- **Date:** 2026-11-06
- **Spec:** §4, §6

## Context

The app has three kinds of traffic:

- pages and tRPC calls, from the owner using the app;
- redirects, from anyone who clicks a short link (the bulk of the traffic, and the part that must be fast);
- queue batches, from the click pipeline (0003).

The redirect should not pay for the whole Next.js request pipeline if that costs real time.

## Decision

- **One Worker, built with OpenNext, handles all three.**
- `worker.ts` is the entry. It exports `fetch` (handed to OpenNext) and `queue` (the click consumer).
- **Fast path, only if it earns its place:** `worker.ts` may answer `GET`/`HEAD` for `^/[A-Za-z0-9]{7}$` itself,
  before Next.js runs.
- `src/app/[slug]/route.ts` calls the same `resolveRedirect()`, so redirects also work under `next dev`.
- The fast path stays **only if measured** under `pnpm preview` and the gain is worth it. The numbers go in the
  README. Otherwise the route handler alone does the job.

## Why not the alternatives

- **A separate Worker just for redirects:** the redirect could be deployed and scaled on its own, but we'd have two
  deployables, two sets of bindings and shared code to package. Nothing measured says we need it.
- **Always keep the fast path:** an extra code path to explain, with a benefit nobody has measured.

## Consequences

- One deploy and one set of bindings (`DB`, `LINKS_CACHE`, `CLICKS`).
- `resolveRedirect()` is the one place redirect logic lives. The route handler and `worker.ts` are thin callers.
- The redirect and the app share a deploy. A broken page build also takes redirects down, until it's rolled back.

## Revisit when

- The measurement is in: mark this Accepted, with or without the fast path.
- Redirect traffic dwarfs app traffic, or app deploys keep putting redirects at risk: split the redirect into its own
  Worker.
