import { formatCount } from "@/features/links/format";

export type KpiItem = { label: string; value: number; note?: string };

/**
 * A hairline-divided strip of large mono numbers (DESIGN.md "Numbers strip").
 * Three items sit in one row; four become 2×2 on phones and one row from 768px.
 */
export function KpiStrip({
  items,
  caption = "Counts update within a few seconds.",
}: {
  items: KpiItem[];
  caption?: string;
}) {
  const four = items.length === 4;
  return (
    <section aria-label="Click totals" className="flex flex-col gap-2">
      <dl
        className={
          four
            ? "grid grid-cols-2 border-y border-hairline md:grid-cols-4 md:divide-x md:divide-hairline"
            : "grid grid-cols-3 divide-x divide-hairline border-y border-hairline"
        }
      >
        {items.map((item, i) => (
          <div
            key={item.label}
            className={
              four
                ? `flex flex-col gap-1 py-3 md:px-3 md:first:pl-0 md:last:pr-0 ${
                    i % 2 === 0 ? "border-r border-hairline pr-3 md:border-r-0" : "pl-3"
                  } ${i < 2 ? "border-b border-hairline md:border-b-0" : ""}`
                : "flex flex-col gap-1 px-3 py-3 first:pl-0 last:pr-0"
            }
          >
            <dt className="text-xs text-ink-muted">{item.label}</dt>
            <dd className="font-mono text-2xl/[30px] font-medium tracking-[-0.01em] tabular-nums">
              {formatCount(item.value)}
            </dd>
            {item.note ? <dd className="text-xs text-ink-muted">{item.note}</dd> : null}
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-muted">{caption}</p>
    </section>
  );
}

export function KpiStripSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className={`grid ${count === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"} gap-px border-y border-hairline`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 py-3 pr-3">
          <div className="h-4 w-16 rounded bg-surface motion-safe:animate-pulse" />
          <div className="h-[30px] w-12 rounded bg-surface motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
