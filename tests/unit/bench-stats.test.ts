import { describe, expect, it } from "vitest";
import { parseServerTiming, percentile, summarize } from "../../scripts/bench/stats.mjs";

describe("bench stats", () => {
  it("nearest-rank percentiles", () => {
    const s = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(95);
    expect(percentile([7], 99)).toBe(7);
  });

  it("summarize sorts and handles empty", () => {
    expect(summarize([3, 1, 2])).toEqual({ n: 3, p50: 2, p95: 3, p99: 3, max: 3 });
    expect(summarize([]).p50).toBeNull();
  });

  it("parses Server-Timing", () => {
    expect(parseServerTiming("kv;dur=1.5, d1;dur=0, total;dur=3.25")).toEqual({
      kv: 1.5,
      d1: 0,
      total: 3.25,
    });
    expect(parseServerTiming(null)).toEqual({});
    expect(parseServerTiming("kv;desc=x")).toEqual({});
  });
});
