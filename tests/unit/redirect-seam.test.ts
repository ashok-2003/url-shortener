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
  const opts = { homeUrl: "https://sho.rt/" };

  it("renders the not-found page", () => {
    const html = renderStatusPage("not-found", opts);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("This link doesn't exist");
    expect(html).toContain("Go to Snip");
  });

  it("renders the expired page", () => {
    const html = renderStatusPage("expired", opts);
    expect(html).toContain("This link has expired");
    expect(html).toContain("Whoever shared it set it to stop working.");
    expect(html).toContain("Make your own short link");
  });

  it("renders the unavailable page with a retry link", () => {
    const html = renderStatusPage("unavailable", {
      ...opts,
      retryUrl: "https://sho.rt/abc1234",
    });
    expect(html).toContain("We couldn't open this link right now");
    expect(html).toContain('<a class="primary" href="https://sho.rt/abc1234">Try again</a>');
    expect(html).toContain('<a class="secondary" href="https://sho.rt/">Go to Snip</a>');
  });

  it("escapes homeUrl and retryUrl", () => {
    const evil = 'https://x.test/"><script>alert(1)</script>';
    for (const kind of ["not-found", "expired", "unavailable"] as const) {
      const html = renderStatusPage(kind, { homeUrl: evil, retryUrl: evil });
      expect(html).not.toContain("<script>");
      expect(html).toContain("&quot;&gt;&lt;script&gt;");
    }
  });
});
