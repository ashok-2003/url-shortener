import { afterEach, expect, it, vi } from "vitest";
import { SLUG_LENGTH } from "@/features/links/schema";
import { generateSlug, SLUG_ALPHABET } from "@/server/links/slug";

afterEach(() => vi.restoreAllMocks());

it("skips biased bytes and maps the rest", () => {
  const seq = [248, 255, 0, 61, 62, 123, 247, 25, 26];
  vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
    const a = arr as unknown as Uint8Array;
    for (let i = 0; i < a.length; i++) a[i] = seq.shift() ?? 0;
    return arr;
  });
  expect(generateSlug()).toBe("A9A99Za");
});

it("only emits alphabet characters at SLUG_LENGTH", () => {
  for (let i = 0; i < 1000; i++) {
    const slug = generateSlug();
    expect(slug).toHaveLength(SLUG_LENGTH);
    for (const ch of slug) expect(SLUG_ALPHABET).toContain(ch);
  }
});
