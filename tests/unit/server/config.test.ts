import { describe, expect, it } from "vitest";
import { ConfigError, LINKS, REDIRECT, readEnv } from "@/server/config";

const ok = {
  DB: {},
  LINKS_CACHE: {},
  CLICKS: {},
  PUBLIC_BASE_URL: "",
} as unknown as CloudflareEnv;

describe("readEnv", () => {
  it("returns typed bindings, empty base URL means null", () => {
    const env = readEnv(ok);
    expect(env.publicBaseUrl).toBeNull();
    expect(env.db).toBe(ok.DB);
    expect(env.linksCache).toBe(ok.LINKS_CACHE);
    expect(env.clicks).toBe(ok.CLICKS);
  });

  it.each(["DB", "LINKS_CACHE", "CLICKS"])(
    "missing %s throws a ConfigError that names it and wrangler.jsonc",
    (b) => {
      const env = { ...ok, [b]: undefined } as unknown as CloudflareEnv;
      expect(() => readEnv(env)).toThrow(ConfigError);
      expect(() => readEnv(env)).toThrow(b);
      expect(() => readEnv(env)).toThrow("wrangler.jsonc");
    },
  );

  it("accepts an http(s) PUBLIC_BASE_URL", () => {
    const env = { ...ok, PUBLIC_BASE_URL: "https://sho.rt" } as CloudflareEnv;
    expect(readEnv(env).publicBaseUrl).toBe("https://sho.rt");
  });

  it.each(["sho.rt", "ftp://sho.rt", "not a url"])(
    "PUBLIC_BASE_URL %j throws a ConfigError",
    (bad) => {
      const env = { ...ok, PUBLIC_BASE_URL: bad } as CloudflareEnv;
      expect(() => readEnv(env)).toThrow(ConfigError);
      expect(() => readEnv(env)).toThrow("PUBLIC_BASE_URL");
    },
  );
});

describe("constants", () => {
  it("exposes the agreed values", () => {
    expect(REDIRECT).toEqual({
      cacheKeyPrefix: "link:",
      cacheMaxTtlSeconds: 604_800,
      cacheMinTtlSeconds: 60,
      retryAfterSeconds: 5,
      maxUserAgentLength: 512,
    });
    expect(LINKS).toEqual({ maxSlugAttempts: 3, statsDays: 30, statsTopN: 5 });
  });
});
