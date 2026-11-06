import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { insertLink } from "../support/db";
import { capturingQueue, runRedirect } from "../support/redirect";
import { callerFor, trpcHttp } from "../support/trpc";

const NOT_FOUND_MESSAGE = "This link doesn't exist.";

function brokenD1(): D1Database {
  const boom = () => {
    throw new Error("D1_ERROR: no such table: links at 10.0.0.1");
  };
  return { prepare: boom, batch: boom, exec: boom } as unknown as D1Database;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    return e as { code: string; message: string };
  }
  throw new Error("expected the call to reject");
}

// PENDING(C): real procedures and resolveRedirect
describe.skip("security", () => {
  describe("ownership", () => {
    it("another owner's link looks exactly like a missing one", async () => {
      const link = await insertLink();
      const other = callerFor({ ownerId: "user_other" });
      const foreign = await rejection(other.links.stats({ slug: link.slug }));
      const missing = await rejection(other.links.stats({ slug: "Missing" }));
      expect(foreign.code).toBe("NOT_FOUND");
      expect(foreign.message).toBe(NOT_FOUND_MESSAGE);
      expect(foreign.code).toBe(missing.code);
      expect(foreign.message).toBe(missing.message);
    });

    it("a cursor from another owner's link never leaks it", async () => {
      const a1 = await insertLink();
      const a2 = await insertLink();
      const a3 = await insertLink();
      const b = await insertLink({ ownerId: "user_other" });
      await insertLink();
      await insertLink();
      const page = await callerFor().links.list({ cursor: b.id });
      expect(page.items.map((i) => i.slug)).toEqual([
        a3.slug,
        a2.slug,
        a1.slug,
      ]);
    });
  });

  it("ignores ownerId in the input", async () => {
    await trpcHttp("POST", "links.create", {
      url: "https://example.com/x",
      ownerId: "attacker",
    });
    const attacker = await callerFor({ ownerId: "attacker" }).links.list({});
    expect(attacker.items).toHaveLength(0);
    const demo = await callerFor().links.list({});
    expect(demo.items).toHaveLength(1);
  });

  it("leaks nothing when storage fails", async () => {
    const { status, body } = await trpcHttp(
      "POST",
      "links.create",
      { url: "https://example.com/x" },
      { db: getDb(brokenD1()) },
    );
    expect(status).toBe(500);
    expect(body.error?.message).toBe("Something went wrong on our side.");
    // The helper parses the response; its serialized form carries the same text.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("D1_ERROR");
    expect(raw).not.toContain("10.0.0.1");
    expect(raw).not.toContain("stack");
  });

  describe("click message", () => {
    const sensitive = {
      "CF-Connecting-IP": "203.0.113.7",
      "X-Forwarded-For": "203.0.113.7",
    };

    it("carries no IP or referrer path and query", async () => {
      const link = await insertLink();
      const { env, sent } = capturingQueue("real");
      const { settle } = await runRedirect(`/${link.slug}`, {
        env,
        headers: { ...sensitive, Referer: "https://t.co/abc?email=a@b.com" },
      });
      await settle();
      expect(sent).toHaveLength(1);
      const text = JSON.stringify(sent[0]);
      expect(text).not.toContain("203.0.113.7");
      expect(text).not.toContain("a@b.com");
      expect((sent[0] as { referrerHost: string | null }).referrerHost).toBe(
        "t.co",
      );
    });

    it("has a null referrerHost without a Referer", async () => {
      const link = await insertLink();
      const { env, sent } = capturingQueue("real");
      const { settle } = await runRedirect(`/${link.slug}`, {
        env,
        headers: sensitive,
      });
      await settle();
      expect(sent).toHaveLength(1);
      expect(
        (sent[0] as { referrerHost: string | null }).referrerHost,
      ).toBeNull();
    });
  });
});
