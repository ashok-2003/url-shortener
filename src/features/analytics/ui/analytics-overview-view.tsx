"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { countryName, deviceLabel, referrerLabel } from "@/features/links/format";
import { BreakdownList } from "@/features/links/ui/breakdown-list";
import { DailyClicksChart, DailyClicksChartSkeleton } from "@/features/links/ui/daily-clicks-chart";
import { KpiStrip, KpiStripSkeleton } from "@/features/links/ui/kpi-strip";
import { useTRPC } from "@/trpc/client";
import { TopLinksList } from "./top-links-list";

/** Same options as the server prefetch in `app/(app)/analytics/page.tsx`. */
export function AnalyticsOverviewView() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.analytics.overview.queryOptions());
  const { totals } = data;
  const windowTotal = data.daily.reduce((n, d) => n + d.clicks, 0);

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <KpiStrip
        items={[
          { label: "All clicks", value: totals.clicks },
          { label: "Last 24 h", value: totals.last24h },
          { label: "Last 7 days", value: totals.last7d },
          { label: "Links", value: totals.links, note: `${totals.activeLinks} active` },
        ]}
      />

      {totals.clicks === 0 ? (
        <p className="text-ink-muted">No clicks yet. Share a link to start seeing numbers.</p>
      ) : (
        <>
          <DailyClicksChart daily={data.daily} />
          <TopLinksList links={data.topLinks} />
          <div className="grid gap-8 lg:grid-cols-3 lg:gap-6">
            <BreakdownList
              title="Top referrers"
              total={windowTotal}
              rows={data.referrers.map((r) => ({
                key: r.host ?? "direct",
                name: referrerLabel(r.host),
                clicks: r.clicks,
              }))}
            />
            <BreakdownList
              title="Top countries"
              total={windowTotal}
              rows={data.countries.map((c) => ({
                key: c.country ?? "unknown",
                name: countryName(c.country),
                clicks: c.clicks,
              }))}
            />
            <BreakdownList
              title="Devices"
              total={windowTotal}
              rows={data.devices.map((d) => ({
                key: d.deviceType || "unknown",
                name: deviceLabel(d.deviceType),
                clicks: d.clicks,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8 md:gap-10">
      <KpiStripSkeleton count={4} />
      <DailyClicksChartSkeleton />
    </div>
  );
}
