import { afterEach, describe, expect, it, vi } from "vitest";
import { SLUG_PATTERN } from "@/features/links/schema";
import { generateSlug } from "@/server/links/slug";

afterEach(() => vi.restoreAllMocks());

/** Seeded PRNG so the statistical test is deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("generateSlug", () => {
  it("10,000 slugs all match SLUG_PATTERN", () => {
    for (let i = 0; i < 10_000; i++) {
      expect(generateSlug()).toMatch(SLUG_PATTERN);
    }
  });

  it("uses crypto.getRandomValues", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    for (let i = 1; i <= 5; i++) {
      generateSlug();
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(i);
    }
  });

  it("is unbiased (chi-square, 62 categories, df 61)", () => {
    const next = mulberry32(42);
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((
      array: ArrayBufferView,
    ) => {
      const bytes = new Uint8Array(
        array.buffer,
        array.byteOffset,
        array.byteLength,
      );
      for (let i = 0; i < bytes.length; i++) bytes[i] = (next() * 256) | 0;
      return array;
    }) as typeof crypto.getRandomValues);

    const counts = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < 100_000; i++) {
      for (const ch of generateSlug()) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
        total++;
      }
    }
    expect(counts.size).toBe(62);
    const expected = total / 62;
    let chiSquare = 0;
    for (const observed of counts.values()) {
      chiSquare += (observed - expected) ** 2 / expected;
    }
    // 0.999 quantile for df 61; byte % 62 would score in the thousands.
    expect(chiSquare).toBeLessThan(101);
  });
});
