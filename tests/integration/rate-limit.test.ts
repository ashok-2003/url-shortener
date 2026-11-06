import { afterEach, describe, expect, it, vi } from "vitest";
import { callerFor, trpcHttp } from "../support/trpc";

const VALID = { url: "https://example.com/x" };

async function createValid(n: number) {
  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(await trpcHttp("POST", "links.create", VALID));
  }
  return results;
}

// PENDING(E): the owner's limiter (spec §9)
describe.skip("create rate limit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("5 succeed, the 6th is TOO_MANY_REQUESTS with retryAfterSeconds in 1..60", async () => {
    const first = await createValid(5);
    expect(first.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const sixth = await trpcHttp("POST", "links.create", VALID);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error?.data.code).toBe("TOO_MANY_REQUESTS");
    expect(sixth.body.error?.message).toBe(
      "You've made 5 links in the last minute.",
    );
    const retry = sixth.body.error?.data.retryAfterSeconds;
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
  });

  it("invalid input never counts", async () => {
    for (let i = 0; i < 10; i++) {
      const bad = await trpcHttp("POST", "links.create", {
        url: "http://x.com",
      });
      expect(bad.status).toBe(400);
    }
    const valid = await createValid(5);
    expect(valid.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
  });

  it("own-host rejections never count", async () => {
    for (let i = 0; i < 10; i++) {
      const own = await trpcHttp("POST", "links.create", {
        url: "https://sho.rt/abc1234",
      });
      expect(own.status).toBe(400);
    }
    const valid = await createValid(5);
    expect(valid.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
  });

  it("10 concurrent creates -> at most 5 succeed", async () => {
    const caller = callerFor();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => caller.links.create(VALID)),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(ok.length).toBeLessThanOrEqual(5);
    expect(failed.length).toBe(10 - ok.length);
    for (const f of failed) {
      expect((f.reason as { code: string }).code).toBe("TOO_MANY_REQUESTS");
    }
  });

  it("another owner is unaffected", async () => {
    await createValid(5);
    const limited = await trpcHttp("POST", "links.create", VALID);
    expect(limited.status).toBe(429);
    const other = await trpcHttp("POST", "links.create", VALID, {
      ownerId: "user_other",
    });
    expect(other.status).toBe(200);
  });

  it("works again after the window", async () => {
    // Fake Date clock; the owner adjusts how this waits if their store expires on real time.
    vi.useFakeTimers({ toFake: ["Date"] });
    await createValid(5);
    const limited = await trpcHttp("POST", "links.create", VALID);
    expect(limited.status).toBe(429);
    vi.advanceTimersByTime(61_000);
    const again = await trpcHttp("POST", "links.create", VALID);
    expect(again.status).toBe(200);
  });
});
