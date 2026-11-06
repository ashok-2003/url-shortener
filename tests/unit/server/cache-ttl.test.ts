import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheKey,
  cacheTtlSeconds,
  fillCache,
  readCachedLink,
} from "@/server/redirect/cache";

afterEach(() => vi.restoreAllMocks());

describe("cacheKey", () => {
  it("prefixes the slug", () => {
    expect(cacheKey("aZ09xYz")).toBe("link:aZ09xYz");
  });
});

describe("cacheTtlSeconds", () => {
  it("uses the maximum for links that never expire", () => {
    expect(cacheTtlSeconds(null, 0)).toBe(604_800);
  });
  it("converts the remaining time to seconds", () => {
    expect(cacheTtlSeconds(3_600_000, 0)).toBe(3_600);
  });
  it("rounds up", () => {
    expect(cacheTtlSeconds(90_500, 0)).toBe(91);
  });
  it("never goes below KV's minimum", () => {
    expect(cacheTtlSeconds(30_000, 0)).toBe(60);
  });
  it("caps at the maximum", () => {
    expect(cacheTtlSeconds(10 * 86_400_000, 0)).toBe(604_800);
  });
  it("measures from now", () => {
    expect(cacheTtlSeconds(1_000_000 + 3_600_000, 1_000_000)).toBe(3_600);
  });
});

const link = { id: 7, targetUrl: "https://example.com/x", expiresAt: null };

function fakeKv(over: { get?: unknown; put?: unknown }) {
  return over as unknown as KVNamespace;
}

describe("readCachedLink", () => {
  it("returns a well-formed value", async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify(link));
    const kv = fakeKv({ get });
    expect(await readCachedLink(kv, "aZ09xYz")).toEqual(link);
    expect(get).toHaveBeenCalledWith("link:aZ09xYz", "text");
  });

  it("accepts a numeric expiresAt", async () => {
    const value = { ...link, expiresAt: 123 };
    const kv = fakeKv({ get: vi.fn().mockResolvedValue(JSON.stringify(value)) });
    expect(await readCachedLink(kv, "s")).toEqual(value);
  });

  it("returns null on a miss without logging", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const kv = fakeKv({ get: vi.fn().mockResolvedValue(null) });
    expect(await readCachedLink(kv, "s")).toBeNull();
    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns null and logs kv.read_failed when the read throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const kv = fakeKv({ get: vi.fn().mockRejectedValue(new Error("kv down")) });
    expect(await readCachedLink(kv, "aZ09xYz")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0])).toMatchObject({
      level: "error",
      event: "kv.read_failed",
      slug: "aZ09xYz",
      error: { message: "kv down" },
    });
  });

  it("returns null and logs kv.bad_value when the value is not JSON", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const kv = fakeKv({
      get: vi.fn().mockResolvedValue("{not json"),
    });
    expect(await readCachedLink(kv, "s")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0]).event).toBe("kv.bad_value");
  });

  it.each([
    ["wrong keys", { foo: 1 }],
    ["string id", { ...link, id: "7" }],
    ["non-finite id", { ...link, id: Number.POSITIVE_INFINITY }],
    ["missing targetUrl", { id: 1, expiresAt: null }],
    ["non-string targetUrl", { ...link, targetUrl: 5 }],
    ["undefined expiresAt", { id: 1, targetUrl: "https://a.b" }],
    ["string expiresAt", { ...link, expiresAt: "soon" }],
    ["array", [1, 2]],
    ["a bare string", "hello"],
  ])("returns null and logs kv.bad_value for %s", async (_name, value) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const kv = fakeKv({
      get: vi.fn().mockResolvedValue(JSON.stringify(value)),
    });
    expect(await readCachedLink(kv, "s")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0])).toMatchObject({
      event: "kv.bad_value",
      slug: "s",
    });
  });
});

describe("fillCache", () => {
  it("puts the JSON with an expirationTtl", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    await fillCache(fakeKv({ put }), "aZ09xYz", link, 0);
    expect(put).toHaveBeenCalledWith("link:aZ09xYz", JSON.stringify(link), {
      expirationTtl: 604_800,
    });
  });

  it("derives the ttl from expiresAt", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    await fillCache(
      fakeKv({ put }),
      "s",
      { ...link, expiresAt: 3_600_000 },
      0,
    );
    expect(put.mock.calls[0][2]).toEqual({ expirationTtl: 3_600 });
  });

  it("logs kv.fill_failed as a warning and resolves when put rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const put = vi.fn().mockRejectedValue(new Error("quota"));
    await expect(
      fillCache(fakeKv({ put }), "aZ09xYz", link, 0),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
      level: "warn",
      event: "kv.fill_failed",
      slug: "aZ09xYz",
      error: { message: "quota" },
    });
  });

  it("resolves when put throws synchronously", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const put = vi.fn(() => {
      throw new Error("sync");
    });
    await expect(fillCache(fakeKv({ put }), "s", link, 0)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
