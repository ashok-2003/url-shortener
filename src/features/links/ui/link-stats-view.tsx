import { CopyButton } from "@/components/copy-button";
import { LocalTime } from "@/components/local-time";
import { ShareButton } from "@/components/share-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  countryName,
  deviceLabel,
  formatDisplayUrl,
  referrerLabel,
} from "@/features/links/format";
import type { LinkStats } from "@/features/links/schema";
import { BreakdownList } from "./breakdown-list";
import { DailyClicksChart, DailyClicksChartSkeleton } from "./daily-clicks-chart";
import { KpiStrip, KpiStripSkeleton } from "./kpi-strip";

export function LinkStatsView({ stats }: { stats: LinkStats }) {
  const { link, totals } = stats;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-sm break-all">{formatDisplayUrl(link.shortUrl)}</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={link.shortUrl} />
          <ShareButton url={link.shortUrl} />
        </div>
        <a
          href={link.targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm break-all text-primary underline underline-offset-2 hover:text-action-hover"
        >
          {link.targetUrl}
        </a>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-ink-muted">Created</dt>
        <dd>
          <LocalTime iso={link.createdAt} format="date-time" />
        </dd>
        <dt className="text-ink-muted">Expires</dt>
        <dd>
          {link.expiresAt ? (
            <LocalTime iso={link.expiresAt} format="date-time" />
          ) : (
            "Never"
          )}
        </dd>
        <dt className="text-ink-muted">Last click</dt>
        <dd>
          {stats.lastClickAt ? (
            <LocalTime iso={stats.lastClickAt} format="date-time" />
          ) : (
            "No clicks yet"
          )}
        </dd>
      </dl>

      <KpiStrip
        items={[
          { label: "All clicks", value: totals.all },
          { label: "Last 24 h", value: totals.last24h },
          { label: "Last 7 days", value: totals.last7d },
        ]}
      />

      {totals.all === 0 ? (
        <p className="text-ink-muted">
          No clicks yet. Share the link to start seeing numbers.
        </p>
      ) : (
        <>
          <DailyClicksChart daily={stats.daily} />
          <BreakdownList
            title="Top referrers"
            total={totals.all}
            rows={stats.referrers.map((r) => ({
              key: r.host ?? "direct",
              name: referrerLabel(r.host),
              clicks: r.clicks,
            }))}
          />
          <BreakdownList
            title="Top countries"
            total={totals.all}
            rows={stats.countries.map((c) => ({
              key: c.country ?? "unknown",
              name: countryName(c.country),
              clicks: c.clicks,
            }))}
          />
          <BreakdownList
            title="Devices"
            total={totals.all}
            rows={stats.devices.map((d) => ({
              key: d.deviceType || "unknown",
              name: deviceLabel(d.deviceType),
              clicks: d.clicks,
            }))}
          />
        </>
      )}
    </div>
  );
}

export function LinkStatsSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading link numbers">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-11 w-40 rounded-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-60" />
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-5 w-56" />
      </div>
      <KpiStripSkeleton />
      <DailyClicksChartSkeleton />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
