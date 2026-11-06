import { env } from "cloudflare:test";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { RATE_LIMIT } from "@/server/config";
import { rateLimitCreate } from "@/server/links/rate-limit";
import { d1RateLimiter } from "@/server/links/rate-limiter";
import { createContext } from "@/server/trpc/context";
import { createCallerFactory, publicProcedure, router } from "@/server/trpc/init";
import { testDb } from "../../support/db";

const { createsPerWindow: LIMIT, windowMs: WINDOW } = RATE_LIMIT;
const T0 = 1_000_000_000_000;

function limiter() {
  return d1RateLimiter(env.DB);
}

async function takeAll(owner: string, now: number) {
  for (let i = 0; i < LIMIT; i++) {
    expect((await limiter().acquire(owner, now)).ok).toBe(true);
  }
}

async function rowCount(owner: string): Promise<number> {
  const row = await env.DB.prepare("SELECT count(*) AS n FROM rate_limit_events WHERE owner_id = ?")
    .bind(owner)
    .first<{ n: number }>();
  return row!.n;
}

describe("d1RateLimiter", () => {
  it("allows the limit, then says wait the whole window", async () => {
    await takeAll("a", T0);
    expect(await limiter().acquire("a", T0)).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("counts down the wait as the window slides", async () => {
    await takeAll("a", T0);
    expect(await limiter().acquire("a", T0 + 30_000)).toEqual({ ok: false, retryAfterSeconds: 30 });
  });

  it("allows again once the window has passed", async () => {
    await takeAll("a", T0);
    expect((await limiter().acquire("a", T0 + WINDOW + 1)).ok).toBe(true);
  });

  it("release frees a slot", async () => {
    await takeAll("a", T0);
    const full = await limiter().acquire("a", T0);
    expect(full.ok).toBe(false);
    const [row] = (await env.DB.prepare("SELECT id FROM rate_limit_events LIMIT 1").all<{ id: string }>()).results;
    await limiter().release(row.id);
    expect((await limiter().acquire("a", T0)).ok).toBe(true);
  });

  it("does not affect another owner", async () => {
    await takeAll("a", T0);
    expect((await limiter().acquire("b", T0)).ok).toBe(true);
  });

  it("gives out exactly the limit to a concurrent burst", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter().acquire("a", T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(LIMIT);
  });

  it("prunes rows older than the window", async () => {
    await takeAll("a", T0);
    await takeAll("b", T0);
    expect((await limiter().acquire("a", T0 + WINDOW + 1)).ok).toBe(true);
    expect(await rowCount("a")).toBe(1); // only the new slot is left
    expect(await rowCount("b")).toBe(LIMIT); // pruning is per owner
  });
});

describe("rateLimitCreate middleware", () => {
  const failing = router({
    create: publicProcedure.use(rateLimitCreate).mutation(() => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "insert failed" });
    }),
  });
  const caller = createCallerFactory(failing)(
    createContext({ db: testDb(), env, baseUrl: "https://sho.rt" }),
  );

  it("does not use up a slot when the create fails", async () => {
    for (let i = 0; i < LIMIT * 2; i++) {
      // Never TOO_MANY_REQUESTS: each failed create gives its slot back.
      await expect(caller.create()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    }
    expect(await rowCount("user_demo")).toBe(0);
  });
});
