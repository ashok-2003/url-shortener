import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLinkInput } from "@/features/links/schema";

const BASE = "https://example.com/";
const MAX_URL = BASE + "a".repeat(2028); // exactly 2048 characters

describe("url security", () => {
  it.each([
    ["   ", "Paste a link to shorten"],
    ["https://", "Enter a full link, starting with https://"],
    ["//example.com", "Enter a full link, starting with https://"],
    ["http://example.com", "Use an https:// link"],
    ["HTTP://x.com", "Use an https:// link"],
    ["javascript:alert(1)", "Use an https:// link"],
    ["JAVASCRIPT:alert(1)", "Use an https:// link"],
    ["data:text/html,hi", "Use an https:// link"],
    ["file:///etc/passwd", "Use an https:// link"],
    ["ftp://x.com", "Use an https:// link"],
    ["blob:https://x.com/1", "Use an https:// link"],
    [
      "https://user:pass@x.com",
      "Links with a username or password aren't allowed",
    ],
    ["https://user@x.com", "Links with a username or password aren't allowed"],
    ["https://:pass@x.com", "Links with a username or password aren't allowed"],
    [
      "https://paypal.com@evil.example",
      "Links with a username or password aren't allowed",
    ],
    [BASE + "a".repeat(2029), "Links can be at most 2048 characters"], // 2049 chars
  ])("rejects %j", (url, message) => {
    const result = createLinkInput.safeParse({ url });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.flattenError(result.error).fieldErrors.url).toEqual([message]);
  });

  it("accepts exactly 2048 characters", () => {
    expect(MAX_URL).toHaveLength(2048);
    const result = createLinkInput.safeParse({ url: MAX_URL });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.url).toBe(MAX_URL);
  });

  it("trims before measuring", () => {
    const result = createLinkInput.safeParse({ url: `  ${MAX_URL}  ` });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.url).toBe(MAX_URL);
  });

  it.each([
    ["https:\\\\evil.com", "evil.com"],
    ["https:/\\evil.com", "evil.com"],
    ["https://exa\tmple.com/a", "example.com"],
    ["https://exa\nmple.com/a", "example.com"],
    ["https:example.com", "example.com"],
    ["https:///example.com", "example.com"],
    ["https://@evil.com", "evil.com"],
  ])("accepts %j and the parser sees host %s", (url, host) => {
    const r = createLinkInput.parse({ url });
    expect(new URL(r.url).host).toBe(host);
  });
});
