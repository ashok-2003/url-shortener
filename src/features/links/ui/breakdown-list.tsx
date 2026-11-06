import { formatCount } from "@/features/links/format";

export type BreakdownRow = { key: string; name: string; clicks: number };

export function BreakdownList({
  title,
  rows,
  total,
}: {
  title: string;
  rows: BreakdownRow[];
  total: number;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base/6 font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing to show yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {rows.map((row) => {
            const share = total > 0 ? Math.min(100, (row.clicks / total) * 100) : 0;
            return (
              <li key={row.key} className="flex flex-col gap-1.5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words">{row.name}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {formatCount(row.clicks)}
                  </span>
                </div>
                <div aria-hidden className="h-1 rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
