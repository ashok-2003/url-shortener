# 0009. Fail loud, keep one config module, log through one logger

- **Status:** Accepted. Ashok set these principles on 2026-11-06.
- **Date:** 2026-11-06
- **Spec:** applies to all backend code

## Context

The owner's rules:

- **Fail loud, never fail silent.** A missing environment variable or binding must stop things with a clear error,
  not carry on quietly with a default.
- **Never hard-code values.** Every value has one source of truth, so a later change happens in one place and a bug
  can be traced to it.
- **Log what happens,** so bugs are visible. Use `console.log` for now. A proper logging system comes later.

## Decision

1. **Configuration problems throw at once.** `readEnv(env)` in `src/server/config.ts` checks every binding (`DB`,
   `LINKS_CACHE`, `CLICKS`) and that `PUBLIC_BASE_URL` is either empty or a valid URL. If anything is wrong it throws a
   `ConfigError` that names the problem and says where to fix it (`wrangler.jsonc`). Every entry point calls it first:
   the tRPC context, `resolveRedirect` and the queue consumer.
2. **Every tunable value lives in one place.**

   | Kind of value                                                      | Its one home                       |
   | ------------------------------------------------------------------ | ---------------------------------- |
   | Contract values the browser also needs (slug pattern, URL length, expiry presets) | `src/features/links/schema.ts` |
   | Server values (KV TTLs, `Retry-After`, slug attempts, stats window, user-agent length) | `src/server/config.ts` |
   | Queue settings (batch size, timeout, retries, concurrency)         | `wrangler.jsonc`, never repeated in code |
   | Bindings and environment variables                                 | `wrangler.jsonc`, read only through `readEnv` |

   A literal appears once. Code imports it, and never retypes it.
3. **One logger.** `src/server/log.ts` exports `log.info`, `log.warn` and `log.error`. Each writes one JSON line
   (`level`, `event`, `time`, plus fields; for errors, the error's name, message and stack) with `console.log`,
   `console.warn` or `console.error`. Workers Logs files each line under the level of the method used. No other server
   file calls `console.*`, and ESLint enforces that for `src/server/**` and `worker.ts`.
4. **Unexpected errors are logged in full on the server and hidden from the client.** The tRPC route logs every error
   through `onError`, while the error formatter still sends the client only "Something went wrong on our side."

## Where we degrade instead of throwing, and stay loud

A visitor following a short link must never get an error because of a side job. In these places the code catches the
failure, **logs it with context**, and carries on. An empty `catch` is never allowed.

| Failure                                   | What the visitor gets                  | What we log                                   |
| ----------------------------------------- | -------------------------------------- | --------------------------------------------- |
| KV read throws, or returns a bad value    | The redirect, served from D1           | `error` `kv.read_failed` / `kv.bad_value`     |
| KV cache fill fails (for example a `429`) | The redirect, already sent             | `warn` `kv.fill_failed`                       |
| D1 read throws on a KV miss               | `503` + `Retry-After` (0008)           | `error` `d1.read_failed`                      |
| `CLICKS.send()` fails                     | The redirect, already sent             | `error` `click.send_failed` (a lost click)    |
| A queue message is malformed              | Nothing (no visitor)                   | `error` `click.bad_message`. The message is retried, so it ends in `clicks-dlq` and isn't deleted |
| Recording a batch fails                   | Nothing                                | `error` `click.record_failed`, then rethrown so Queues retries |

## Why not the alternatives

- **A singleton that caches config across requests:** Workers share nothing between requests, and the spec forbids
  module-level mutable state (AGENTS.md rule 1). An ES module is already evaluated once per isolate, so frozen
  constants in `config.ts` give the "one instance, one place" benefit without the state. `readEnv` is a cheap pure
  function, run once per request.
- **Default values for missing bindings:** this is exactly the silent failure the owner ruled out.
- **Bare `console.log` calls everywhere:** swapping in a real logger later would mean touching every file.

## Consequences

- A misconfigured deploy fails on its first request, with a message that says what's missing.
- Every degraded path leaves an `error` or `warn` line, so it can be found in Workers Logs.
- Moving to a real logging system is a change to one file (`docs/architecture/extending.md`).

## Revisit when

A log drain or tracing tool is adopted. `log.ts` changes, and nothing else should.
