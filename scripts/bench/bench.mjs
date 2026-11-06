#!/usr/bin/env node
// Speed report for link creation and redirects. A report, not a gate:
// exits 0 whatever the numbers, 1 only if the server can't be reached.
import { parseArgs } from "node:util";
import { parseServerTiming, summarize } from "./stats.mjs";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://localhost:8787" },
    links: { type: "string", default: "5" },
    requests: { type: "string", default: "500" },
    concurrency: { type: "string", default: "10" },
    json: { type: "boolean", default: false },
  },
});

const base = String(values["base-url"]).replace(/\/+$/, "");
const linkCount = Math.max(1, Number.parseInt(String(values.links), 10) || 5);
const requestCount = Math.max(0, Number.parseInt(String(values.requests), 10) || 0);
const concurrency = Math.max(1, Number.parseInt(String(values.concurrency), 10) || 10);

/**
 * @typedef {{ ms: number, status: number, timing: Record<string, number> }} Sample
 */

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<Sample & { body: string }>}
 */
async function timed(path, init) {
  const start = performance.now();
  const res = await fetch(base + path, { redirect: "manual", ...init });
  const body = await res.text();
  const ms = performance.now() - start;
  return {
    ms,
    status: res.status,
    timing: parseServerTiming(res.headers.get("server-timing")),
    body,
  };
}

/** @param {string} slug */
const redirect = (slug) => timed(`/${encodeURIComponent(slug)}`);

async function main() {
  /** @type {Sample[]} */ const creates = [];
  /** @type {string[]} */ const slugs = [];
  let createFailures = 0;

  for (let i = 0; i < linkCount; i++) {
    const r = await timed("/api/trpc/links.create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `https://example.com/bench-${i}` }),
    });
    let slug;
    try {
      slug = JSON.parse(r.body)?.result?.data?.slug;
    } catch {
      slug = undefined;
    }
    if (r.status === 200 && typeof slug === "string") {
      creates.push(r);
      slugs.push(slug);
    } else {
      createFailures++;
    }
  }

  if (slugs.length === 0) {
    console.error(`No links could be created (${createFailures} failed). Nothing to redirect.`);
  }

  /** @type {Sample[]} */ const cold = [];
  for (const slug of slugs) cold.push(await redirect(slug));

  /** @type {Sample[]} */ const warm = [];
  if (slugs.length > 0) {
    let next = 0;
    const worker = async () => {
      while (next < requestCount) {
        const i = next++;
        warm.push(await redirect(slugs[i % slugs.length]));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, worker));
  }

  /** @param {Sample[]} xs @param {(s: Sample) => number | undefined} f */
  const pick = (xs, f) => xs.map(f).filter((v) => typeof v === "number");
  const nonRedirect = (/** @type {Sample[]} */ xs) => xs.filter((s) => s.status !== 302).length;

  const rows = [
    ["create (client)", summarize(pick(creates, (s) => s.ms)), createFailures],
    ["redirect cold (client)", summarize(pick(cold, (s) => s.ms)), nonRedirect(cold)],
    ["redirect cold (server total)", summarize(pick(cold, (s) => s.timing.total)), null],
    ["redirect warm (client)", summarize(pick(warm, (s) => s.ms)), nonRedirect(warm)],
    ["redirect warm (server total)", summarize(pick(warm, (s) => s.timing.total)), null],
    ["redirect warm (server kv)", summarize(pick(warm, (s) => s.timing.kv)), null],
    ["redirect warm (server d1)", summarize(pick(warm, (s) => s.timing.d1)), null],
  ];

  const allTotals = summarize([...pick(cold, (s) => s.timing.total), ...pick(warm, (s) => s.timing.total)]);
  const warmTotal = rows[4][1];
  const verdict = (/** @type {number | null} */ p95, /** @type {number} */ limit) =>
    p95 === null ? "no data" : p95 <= limit ? "meets" : "misses";
  const targets = [
    {
      label: "warm server total p95 <= 20 ms (KV hit)",
      result: verdict(warmTotal.p95, 20),
    },
    {
      label: "all redirects server total p95 <= 50 ms",
      result: verdict(allTotals.p95, 50),
    },
  ];

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          baseUrl: base,
          rows: rows.map(([name, stats, non302]) => ({ name, ...stats, non302 })),
          targets,
        },
        null,
        2,
      ),
    );
    return;
  }

  const f = (/** @type {number | null} */ v) => (v === null ? "-" : v.toFixed(1));
  const header = ["", "n", "p50", "p95", "p99", "max", "non-302"];
  const table = [
    header,
    ...rows.map(([name, s, bad]) => [
      String(name),
      String(s.n),
      f(s.p50),
      f(s.p95),
      f(s.p99),
      f(s.max),
      bad === null ? "" : String(bad),
    ]),
  ];
  const widths = header.map((_, c) => Math.max(...table.map((r) => r[c].length)));
  console.log(`Target: ${base}  (times in ms; create "non-302" column counts failed creates)\n`);
  for (const r of table) {
    console.log(r.map((cell, c) => (c === 0 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join("  "));
  }
  console.log("");
  for (const t of targets) console.log(`${t.label}: ${t.result}`);
  console.log("\nLocal Miniflare numbers. Point --base-url at a deployed Worker for production figures.");
}

main().catch((err) => {
  const cause = err && typeof err === "object" && "cause" in err ? err.cause : null;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET" || err instanceof TypeError) {
    console.error(`Could not reach ${base}. Is the server running? Try \`pnpm preview\` first.`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
