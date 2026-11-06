import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ConfigError, REDIRECT } from "@/server/config";
import { resolveRedirect } from "@/server/redirect/resolve";
import { insertLink } from "../../support/db";
import { BASE_URL } from "../../support/trpc";

let errorSpy: MockInstance<typeof console.error>;
let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Overrides = {
  DB?: unknown;
  LINKS_CACHE?: unknown;
  CLICKS?: unknown;
};

async function run(path: string, overrides: Overrides = {}) {
  const pending: Promise<unknown>[] = [];
  const response = await resolveRedirect({
    request: new Request(`${BASE_URL}${path}`),
    env: { ...env, ...overrides } as unknown as CloudflareEnv,
    waitUntil: (p) => {
      pending.push(p);
    },
    cf: null,
  });
  const settled = await Promise.allSettled(pending);
  return { response, settled };
}

function logged(spy: MockInstance, event: string) {
  const lines = spy.mock.calls
    .map((c) => JSON.parse(String(c[0])) as { event: string; level: string })
    .filter((l) => l.event === event);
  return lines;
}

/** A D1 binding whose every prepared statement throws. */
const brokenDb = {
  prepare() {
    throw new Error("D1 down");
  },
};

function kvWith(overrides: Partial<Record<"get" | "put", unknown>>) {
  return new Proxy(env.LINKS_CACHE, {
    get(target, prop) {
      if (prop in overrides) return overrides[prop as "get" | "put"];
      const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("redirect resilience", () => {
  it("D1 throws on a KV miss -> 503 with retry, nothing queued", async () => {
    await insertLink({ slug: "res0001" });
    const send = vi.fn();
    const { response } = await run("/res0001", {
      DB: brokenDb,
      CLICKS: { send },
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe(
      String(REDIRECT.retryAfterSeconds),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain(`${BASE_URL}/res0001`);
    expect(send).not.toHaveBeenCalled();
    expect(logged(errorSpy, "d1.read_failed")).toHaveLength(1);
  });

  it("D1 throws but KV holds the link -> 302", async () => {
    const link = await insertLink({ slug: "res0002" });
    await run("/res0002"); // fills KV
    const { response } = await run("/res0002", { DB: brokenDb });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(link.targetUrl);
  });

  it("KV get throws -> 302 from D1, logs kv.read_failed", async () => {
    const link = await insertLink({ slug: "res0003" });
    const { response } = await run("/res0003", {
      LINKS_CACHE: kvWith({
        get: () => Promise.reject(new Error("KV down")),
      }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(link.targetUrl);
    expect(logged(errorSpy, "kv.read_failed")).toHaveLength(1);
  });

  it("KV holds a malformed value -> 302 from D1, logs kv.bad_value", async () => {
    const link = await insertLink({ slug: "res0004" });
    await env.LINKS_CACHE.put(`${REDIRECT.cacheKeyPrefix}res0004`, "{nope");
    const { response } = await run("/res0004");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(link.targetUrl);
    expect(logged(errorSpy, "kv.bad_value")).toHaveLength(1);
  });

  it("KV put rejects -> still 302, waitUntil fulfilled, logs kv.fill_failed", async () => {
    await insertLink({ slug: "res0005" });
    const { response, settled } = await run("/res0005", {
      LINKS_CACHE: kvWith({
        put: () => Promise.reject(new Error("KV put down")),
      }),
    });
    expect(response.status).toBe(302);
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((s) => s.status === "fulfilled")).toBe(true);
    expect(logged(warnSpy, "kv.fill_failed")).toHaveLength(1);
  });

  it("CLICKS.send rejects -> still 302, waitUntil fulfilled, logs click.send_failed", async () => {
    await insertLink({ slug: "res0006" });
    const { response, settled } = await run("/res0006", {
      CLICKS: { send: () => Promise.reject(new Error("queue down")) },
    });
    expect(response.status).toBe(302);
    expect(settled.every((s) => s.status === "fulfilled")).toBe(true);
    expect(logged(errorSpy, "click.send_failed")).toHaveLength(1);
  });

  it("an expired link in D1 -> 410 and nothing written to KV", async () => {
    await insertLink({ slug: "res0007", expiresAt: new Date(Date.now() - 60_000) });
    const { response, settled } = await run("/res0007");
    expect(response.status).toBe(410);
    await Promise.all(settled);
    expect(
      await env.LINKS_CACHE.get(`${REDIRECT.cacheKeyPrefix}res0007`),
    ).toBeNull();
  });

  it("a missing LINKS_CACHE binding throws ConfigError", async () => {
    await insertLink({ slug: "res0008" });
    await expect(run("/res0008", { LINKS_CACHE: undefined })).rejects.toThrow(
      ConfigError,
    );
  });
});
