// Small statistics helpers for the speed report. No dependencies.

/**
 * Nearest-rank percentile of an ascending-sorted array.
 * @param {number[]} sorted
 * @param {number} p percentile, 0-100
 * @returns {number}
 */
export function percentile(sorted, p) {
  const n = sorted.length;
  const rank = Math.min(n, Math.max(1, Math.ceil((p / 100) * n)));
  return sorted[rank - 1];
}

/**
 * @param {number[]} samples
 * @returns {{ n: number, p50: number | null, p95: number | null, p99: number | null, max: number | null }}
 */
export function summarize(samples) {
  const n = samples.length;
  if (n === 0) return { n: 0, p50: null, p95: null, p99: null, max: null };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[n - 1],
  };
}

/**
 * Parse a Server-Timing header into { name: durationMs }. Entries without a
 * numeric `dur` are skipped.
 * @param {string | null | undefined} header
 * @returns {Record<string, number>}
 */
export function parseServerTiming(header) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!header) return out;
  for (const entry of header.split(",")) {
    const [rawName, ...params] = entry.split(";").map((s) => s.trim());
    if (!rawName) continue;
    for (const param of params) {
      const m = /^dur=(\d+(?:\.\d+)?)$/.exec(param);
      if (m) out[rawName] = Number(m[1]);
    }
  }
  return out;
}
