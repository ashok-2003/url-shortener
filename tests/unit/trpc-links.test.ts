import { describe, expect, it } from "vitest";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { SLUG_PATTERN } from "@/features/links/schema";
import type { Db } from "@/server/db/client";
import {
  DEMO_USER_ID,
  createContext,
  resolveBaseUrl,
} from "@/server/trpc/context";
import { createCallerFactory } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/router";

const ctx = createContext({
  db: {} as Db,
  env: {} as CloudflareEnv,
  baseUrl: "https://sho.rt",
});
const caller = createCallerFactory(appRouter)(ctx);

type Body = {
  error: {
    message: string;
    data: {
      code: string;
      fieldErrors: unknown;
      retryAfterSeconds: number | null;
    };
  };
  result: { data: { items: { slug: string }[] } };
};

async function post(path: string, input: unknown) {
  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: new Request(`https://sho.rt/api/trpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    router: appRouter,
    createContext: () => ctx,
  });
  return { status: res.status, body: (await res.json()) as Body };
}

async function get(path: string, input: unknown) {
  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: new Request(
      `https://sho.rt/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`,
    ),
    router: appRouter,
    createContext: () => ctx,
  });
  return { status: res.status, body: (await res.json()) as Body };
}

describe("links.create", () => {
  it("returns a LinkSummary", async () => {
    const link = await caller.links.create({
      url: "https://example.com/x",
      expiry: { kind: "preset", preset: "1h" },
    });
    expect(link.slug).toMatch(SLUG_PATTERN);
    expect(link.shortUrl).toBe(`https://sho.rt/${link.slug}`);
    expect(link).toMatchObject({
      targetUrl: "https://example.com/x",
      clicks: 0,
      isExpired: false,
    });
    expect(Date.parse(link.expiresAt!) - Date.parse(link.createdAt)).toBe(
      3_600_000,
    );
  });

  it("http:// -> 400 with fieldErrors.url", async () => {
    const { status, body } = await post("links.create", {
      url: "http://example.com",
    });
    expect(status).toBe(400);
    expect(body.error.data).toMatchObject({
      code: "BAD_REQUEST",
      fieldErrors: { url: ["Use an https:// link"] },
      retryAfterSeconds: null,
    });
  });

  it("own host -> 400 before the limiter", async () => {
    const { status, body } = await post("links.create", {
      url: "https://sho.rt/abc1234",
    });
    expect(status).toBe(400);
    expect(body.error.data.fieldErrors).toEqual({
      url: ["That's already a short link from this app"],
    });
    expect(body.error.data.retryAfterSeconds).toBeNull();
  });

  it("ratelimit.test -> 429 with retryAfterSeconds 42", async () => {
    const { status, body } = await post("links.create", {
      url: "https://ratelimit.test/x",
    });
    expect(status).toBe(429);
    expect(body.error.data).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      retryAfterSeconds: 42,
    });
  });

  it("error.test -> 500 without internals", async () => {
    const { status, body } = await post("links.create", {
      url: "https://error.test/x",
    });
    expect(status).toBe(500);
    expect(body.error.message).toBe("Something went wrong on our side.");
    expect(body.error.data).not.toHaveProperty("stack");
    expect(JSON.stringify(body)).not.toContain("10.0.0.1");
  });
});

describe("links.list", () => {
  it("pages newest first", async () => {
    const p1 = await caller.links.list({});
    expect(p1.items).toHaveLength(20);
    expect(p1.items[0].slug).toBe("demo023");
    expect(p1.nextCursor).toBe(4);
    const p2 = await caller.links.list({ cursor: 4 });
    expect(p2.items.map((l) => l.slug)).toEqual([
      "demo003",
      "demo002",
      "demo001",
    ]);
    expect(p2.nextCursor).toBeNull();
  });

  it("carries the UI states", async () => {
    const { items } = await caller.links.list({});
    const by = Object.fromEntries(items.map((l) => [l.slug, l]));
    expect(by.demo023).toMatchObject({ clicks: 1284, expiresAt: null });
    expect(by.demo022.isExpired).toBe(false);
    expect(by.demo022.expiresAt).not.toBeNull();
    expect(by.demo021.isExpired).toBe(true);
    expect(by.demo020.clicks).toBe(0);
  });

  it("works over HTTP GET", async () => {
    const { status, body } = await get("links.list", {});
    expect(status).toBe(200);
    expect(body.result.data.items[0].slug).toBe("demo023");
  });
});

describe("links.stats", () => {
  it("unknown slug -> NOT_FOUND", async () => {
    const { status, body } = await get("links.stats", { slug: "zzzzzzz" });
    expect(status).toBe(404);
    expect(body.error.data.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("This link doesn't exist.");
  });

  it("demo023 totals agree", async () => {
    const stats = await caller.links.stats({ slug: "demo023" });
    expect(stats.daily).toHaveLength(30);
    expect(stats.totals.all).toBe(stats.link.clicks);
    const last7 = stats.daily.slice(-7).reduce((n, d) => n + d.clicks, 0);
    expect(stats.totals.last7d).toBe(last7);
    expect(stats.totals.last24h).toBe(stats.daily[29].clicks);
  });

  it("demo020 is all zeros", async () => {
    const stats = await caller.links.stats({ slug: "demo020" });
    expect(stats.totals).toEqual({ all: 0, last24h: 0, last7d: 0 });
    expect(stats.daily.every((d) => d.clicks === 0)).toBe(true);
  });
});

describe("context", () => {
  it("defaults ownerId to user_demo", () => {
    expect(ctx.ownerId).toBe(DEMO_USER_ID);
    expect(DEMO_USER_ID).toBe("user_demo");
  });

  it("carries env", () => {
    const env = { PUBLIC_BASE_URL: "" } as CloudflareEnv;
    expect(
      createContext({ db: {} as Db, env, baseUrl: "https://a.b" }).env,
    ).toBe(env);
  });

  it("resolveBaseUrl prefers PUBLIC_BASE_URL and strips trailing slash", () => {
    expect(resolveBaseUrl("https://o.example")).toBe("https://o.example");
    expect(resolveBaseUrl("https://o.example", "")).toBe("https://o.example");
    expect(resolveBaseUrl("https://o.example", "https://sho.rt/")).toBe(
      "https://sho.rt",
    );
  });
});
