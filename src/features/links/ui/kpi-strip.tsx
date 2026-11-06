import { formatCount } from "@/features/links/format";
import type { LinkStats } from "@/features/links/schema";

export function KpiStrip({ totals }: { totals: LinkStats["totals"] }) {
  const items = [
    { label: "All clicks", value: totals.all },
    { label: "Last 24 h", value: totals.last24h },
    { label: "Last 7 days", value: totals.last7d },
  ];
  return (
    <section aria-label="Click totals" className="flex flex-col gap-2">
      <dl className="grid grid-cols-3 divide-x divide-hairline border-y border-hairline">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 px-3 py-3 first:pl-0 last:pr-0">
            <dt className="text-xs text-ink-muted">{item.label}</dt>
            <dd className="font-mono text-2xl/[30px] font-medium tracking-[-0.01em] tabular-nums">
              {formatCount(item.value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-muted">Counts update within a few seconds.</p>
    </section>
  );
}

export function KpiStripSkeleton() {
  return (
    <div className="grid grid-cols-3 divide-x divide-hairline border-y border-hairline" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 px-3 py-3 first:pl-0 last:pr-0">
          <div className="h-4 w-16 rounded bg-surface motion-safe:animate-pulse" />
          <div className="h-[30px] w-12 rounded bg-surface motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
