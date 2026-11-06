import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { insertClicks, insertLink } from "../support/db";
import { runRedirect } from "../support/redirect";
import { callerFor } from "../support/trpc";

// Proves the workers project, the migrations and the support helpers work.
describe("integration harness", () => {
  it("applies the migrations", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(
      expect.arrayContaining(["links", "click_events"]),
    );
  });

  it("insertLink writes a row", async () => {
    const link = await insertLink({ slug: "harness" });
    expect(link.id).toBeGreaterThan(0);
    expect(link.slug).toBe("harness");
  });

  it("clears storage between tests", async () => {
    const row = await env.DB.prepare("SELECT count(*) AS n FROM links").first<{
      n: number;
    }>();
    expect(row?.n).toBe(0);
  });

  it("insertClicks keeps links.clicks in step", async () => {
    const link = await insertLink();
    await insertClicks(link.id, Array.from({ length: 12 }, () => ({})));
    const row = await env.DB.prepare(
      "SELECT clicks, last_click_at FROM links WHERE id = ?",
    )
      .bind(link.id)
      .first<{ clicks: number; last_click_at: number | null }>();
    expect(row?.clicks).toBe(12);
    expect(row?.last_click_at).not.toBeNull();
  });

  it("callerFor runs the real router", async () => {
    const page = await callerFor().links.list({});
    expect(Array.isArray(page.items)).toBe(true);
  });

  it("runRedirect returns a Response", async () => {
    const { response } = await runRedirect("/abc1234");
    expect(response).toBeInstanceOf(Response);
  });

  it("KV and the queue binding work", async () => {
    await env.LINKS_CACHE.put("k", "v");
    expect(await env.LINKS_CACHE.get("k")).toBe("v");
    // Rejects (and fails the test) if the producer binding is missing.
    await env.CLICKS.send({ ping: 1 });
  });
});
