import { describe, expect, it } from "vitest";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Db } from "@/server/db/client";
import {
  DEMO_USER_ID,
  createContext,
  resolveBaseUrl,
} from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/router";

const ctx = createContext({
  db: {} as Db,
  env: {} as CloudflareEnv,
  baseUrl: "https://sho.rt",
});

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


// Fixture-based list/stats/create tests were retired when the procedures moved to D1;
// the real behaviour is covered by the workers integration suite (workstream D).
describe("links.create", () => {
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
