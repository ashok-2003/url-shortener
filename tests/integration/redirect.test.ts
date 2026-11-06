import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { insertLink } from "../support/db";
import { capturingQueue, countingEnv, runRedirect } from "../support/redirect";
import { callerFor } from "../support/trpc";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const MIN = 60_000;

afterEach(() => {
  vi.useRealTimers();
});

function freezeClock(at: Date = NOW) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}

describe("redirect: paths that are not slugs", () => {
  it.each(["/abc", "/abc12345", "/abc-123", "/abc1234/", "/abc%31234"])(
    "%s -> 404 without touching storage",
    async (p) => {
      const c = countingEnv();
      const { response } = await runRedirect(p, { env: c.env });
      expect(response.status).toBe(404);
      expect(c.touches()).toBe(0);
    },
  );
});

// PENDING(C): resolveRedirect, KV read-through and the click producer
describe.skip("redirect rules", () => {
  describe("basics", () => {
    it("302 to the target, never cached, never 301", async () => {
      const link = await insertLink({ slug: "abc1234" });
      const { response } = await runRedirect("/abc1234");
      expect(response.status).toBe(302);
      expect(response.status).not.toBe(301);
      expect(response.headers.get("location")).toBe(link.targetUrl);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    it("ignores a query string", async () => {
      await insertLink({ slug: "abc1234" });
      const { response } = await runRedirect("/abc1234?utm_source=x");
      expect(response.status).toBe(302);
    });

    it("treats slugs as case-sensitive", async () => {
      await insertLink({ slug: "AbC1234" });
      expect((await runRedirect("/abc1234")).response.status).toBe(404);
      expect((await runRedirect("/AbC1234")).response.status).toBe(302);
    });

    it("answers an unknown slug with a no-store 404 page", async () => {
      const { response } = await runRedirect("/nope123");
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("This link doesn't exist");
      expect(response.headers.get("cache-control")).toContain("no-store");
    });
  });

  describe("expiry and KV", () => {
    it("expiresAt = now is 410, now + 1 ms still redirects", async () => {
      freezeClock();
      await insertLink({ slug: "gone123", expiresAt: new Date(NOW) });
      await insertLink({
        slug: "live123",
        expiresAt: new Date(NOW.getTime() + 1),
      });
      const gone = (await runRedirect("/gone123")).response;
      expect(gone.status).toBe(410);
      expect(await gone.text()).toContain("This link has expired");
      expect((await runRedirect("/live123")).response.status).toBe(302);
    });

    it("a KV entry that outlives its link gives 410", async () => {
      freezeClock();
      await insertLink({
        slug: "short12",
        expiresAt: new Date(NOW.getTime() + 2 * MIN),
      });
      const first = await runRedirect("/short12");
      expect(first.response.status).toBe(302);
      await first.settle();
      vi.setSystemTime(new Date(NOW.getTime() + 3 * MIN));
      expect((await runRedirect("/short12")).response.status).toBe(410);
    });

    it.each([
      ["never", null, 7 * 24 * 3600],
      ["in 1 h", 3600_000, 3600],
      ["in 30 s", 30_000, 60],
    ])(
      "fills KV with the right expiry (link expires %s)",
      async (_label, offsetMs, ttlSeconds) => {
        const link = await insertLink({
          slug: "kvfill1",
          expiresAt: offsetMs === null ? null : new Date(Date.now() + offsetMs),
        });
        const first = await runRedirect("/kvfill1");
        expect(first.response.status).toBe(302);
        await first.settle();
        const { keys } = await env.LINKS_CACHE.list({ prefix: "link:" });
        const key = keys.find((k) => k.name === `link:${link.slug}`);
        expect(key).toBeDefined();
        const expected = Math.floor(Date.now() / 1000) + ttlSeconds;
        expect(
          Math.abs((key?.expiration ?? 0) - expected),
        ).toBeLessThanOrEqual(5);
      },
    );

    it("never caches a 404", async () => {
      const first = await runRedirect("/late123");
      await first.settle();
      expect(first.response.status).toBe(404);
      await insertLink({ slug: "late123" });
      expect((await runRedirect("/late123")).response.status).toBe(302);
    });
  });

  describe("clicks", () => {
    it("HEAD records nothing, GET records exactly one click", async () => {
      const link = await insertLink({ slug: "click12" });
      const q = capturingQueue("real");
      const head = await runRedirect("/click12", {
        method: "HEAD",
        env: q.env,
      });
      await head.settle();
      expect(head.response.status).toBe(302);
      expect(q.sent).toEqual([]);

      const before = Date.now();
      const get = await runRedirect("/click12", {
        env: q.env,
        headers: {
          referer: "https://news.example.org/post?id=1",
          "user-agent": "TestAgent/1.0",
        },
        cf: { country: "IN" },
      });
      await get.settle();
      expect(q.sent).toHaveLength(1);
      expect(q.sent[0]).toEqual({
        clickId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        linkId: link.id,
        clickedAt: expect.any(Number),
        referrerHost: "news.example.org",
        country: "IN",
        userAgent: "TestAgent/1.0",
      });
      const at = (q.sent[0] as { clickedAt: number }).clickedAt;
      expect(Math.abs(at - before)).toBeLessThan(1000);
    });

    it("does not wait for the queue", async () => {
      await insertLink({ slug: "hang123" });
      const q = capturingQueue("hang");
      const timeout = new Promise<"timeout">((r) =>
        setTimeout(() => r("timeout"), 1000),
      );
      const result = await Promise.race([
        runRedirect("/hang123", { env: q.env }),
        timeout,
      ]);
      expect(result).not.toBe("timeout");
    });

    it("a real send() inside waitUntil settles cleanly", async () => {
      await insertLink({ slug: "real123" });
      const q = capturingQueue("real");
      const { settle } = await runRedirect("/real123", { env: q.env });
      await expect(settle()).resolves.toBeUndefined();
      expect(q.sent).toHaveLength(1);
    });

    it("reports country from cf, or null without it", async () => {
      await insertLink({ slug: "geo1234" });
      const withCf = capturingQueue("real");
      const a = await runRedirect("/geo1234", {
        env: withCf.env,
        cf: { country: "IN" },
      });
      await a.settle();
      expect(withCf.sent[0]).toMatchObject({ country: "IN" });

      const noCf = capturingQueue("real");
      const b = await runRedirect("/geo1234", { env: noCf.env, cf: null });
      await b.settle();
      expect(noCf.sent[0]).toMatchObject({ country: null });
    });
  });

  describe("Server-Timing", () => {
    it("reports kv, d1 and total, with d1;dur=0 on a KV hit", async () => {
      await insertLink({ slug: "timing1" });
      const first = await runRedirect("/timing1");
      await first.settle();
      const timing = first.response.headers.get("server-timing") ?? "";
      expect(timing).toMatch(/kv;dur=[\d.]+/);
      expect(timing).toMatch(/d1;dur=[\d.]+/);
      expect(timing).toMatch(/total;dur=[\d.]+/);

      const second = await runRedirect("/timing1");
      expect(second.response.headers.get("server-timing")).toContain(
        "d1;dur=0",
      );
    });
  });

  describe("non-ASCII targets", () => {
    it.each(["https://example.com/€", "https://例え.jp/"])(
      "%s redirects to its normalised href",
      async (input) => {
        const created = await callerFor().links.create({ url: input });
        const { response } = await runRedirect(`/${created.slug}`);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(new URL(input).href);
      },
    );
  });
});
