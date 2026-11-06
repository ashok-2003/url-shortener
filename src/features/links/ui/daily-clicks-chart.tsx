import { formatCount } from "@/features/links/format";
import type { LinkStats } from "@/features/links/schema";

// Dates are UTC calendar days ("2026-11-06"), so format them in UTC. Going
// through LocalTime would shift the day for viewers west of UTC.
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

export function DailyClicksChart({ daily }: { daily: LinkStats["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.clicks));
  const first = daily[0];
  const middle = daily[Math.floor((daily.length - 1) / 2)];
  const last = daily[daily.length - 1];

  return (
    <section aria-labelledby="daily-clicks-title" className="flex flex-col gap-2">
      <h3 id="daily-clicks-title" className="text-base/6 font-semibold">
        Clicks per day, last 30 days
      </h3>
      <div aria-hidden className="flex h-32 items-stretch gap-[2px]">
        {daily.map((d) => (
          <div
            key={d.date}
            title={`${formatDay(d.date)}: ${formatCount(d.clicks)}`}
            className="flex flex-1 flex-col justify-end rounded-t-[4px] bg-surface"
          >
            {d.clicks > 0 ? (
              <div
                className="w-full rounded-t-[4px] bg-primary"
                style={{ height: `max(2px, ${(d.clicks / max) * 100}%)` }}
              />
            ) : null}
          </div>
        ))}
      </div>
      {first && middle && last ? (
        <div aria-hidden className="flex justify-between text-xs text-ink-muted">
          <span>{formatDay(first.date)}</span>
          <span>{formatDay(middle.date)}</span>
          <span>{formatDay(last.date)}</span>
        </div>
      ) : null}
      <table className="sr-only">
        <caption>Clicks per day, last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Clicks</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.date}>
              <th scope="row">{formatDay(d.date)}</th>
              <td>{d.clicks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function DailyClicksChartSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="h-6 w-56 rounded bg-surface motion-safe:animate-pulse" />
      <div className="h-32 rounded bg-surface motion-safe:animate-pulse" />
    </div>
  );
}
