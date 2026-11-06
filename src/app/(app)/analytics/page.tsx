import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTitle } from "@/components/page-title";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { brand } from "@/config/brand";
import {
  AnalyticsOverviewView,
  AnalyticsSkeleton,
} from "@/features/analytics/ui/analytics-overview-view";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Analytics · ${brand.name}` };

export default function AnalyticsPage() {
  prefetch(trpc.analytics.overview.queryOptions());
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageTitle caption="All your links, last 30 days.">Analytics</PageTitle>
      <HydrateClient>
        <QueryErrorBoundary message="Couldn't load analytics.">
          <Suspense fallback={<AnalyticsSkeleton />}>
            <AnalyticsOverviewView />
          </Suspense>
        </QueryErrorBoundary>
      </HydrateClient>
    </div>
  );
}
