import { Suspense } from "react";
import { PageTitle } from "@/components/page-title";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { brand } from "@/config/brand";
import { RECENT_LIMIT } from "@/features/links/list-query";
import { CreateLinkForm } from "@/features/links/ui/create-link-form";
import { RecentLinks, RecentLinksSkeleton } from "@/features/links/ui/recent-links";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// Per-user and request-dependent (spec section 3): never prerender.
export const dynamic = "force-dynamic";

export default function HomePage() {
  // In-process call to the router, not an HTTP fetch to our own Worker.
  prefetch(trpc.links.list.queryOptions({ limit: RECENT_LIMIT }));
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageTitle caption={brand.description}>Home</PageTitle>
      <section aria-label="Shorten a link">
        <CreateLinkForm />
      </section>
      <section aria-labelledby="recent-title">
        <HydrateClient>
          <QueryErrorBoundary message="Couldn't load your links.">
            <Suspense fallback={<RecentLinksSkeleton />}>
              <RecentLinks />
            </Suspense>
          </QueryErrorBoundary>
        </HydrateClient>
      </section>
    </div>
  );
}
