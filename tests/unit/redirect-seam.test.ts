import { describe, expect, it } from "vitest";
import { renderStatusPage } from "@/features/status-pages/render";
import { resolveRedirect } from "@/server/redirect/resolve";

describe("resolveRedirect (stub)", () => {
  it("returns the not-found page, uncached", async () => {
    const res = await resolveRedirect({
      request: new Request("https://sho.rt/abc1234"),
      env: {} as CloudflareEnv,
      waitUntil: () => {},
      cf: null,
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const html = await res.text();
    expect(html).toContain("This link doesn't exist");
    expect(html).toContain('href="https://sho.rt/"');
  });
});

describe("renderStatusPage", () => {
  it("renders the expired page", () => {
    const html = renderStatusPage("expired", { homeUrl: "https://sho.rt/" });
    expect(html).toContain("This link has expired");
    expect(html).toContain("<!doctype html>");
  });
});
