import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTitle } from "@/components/page-title";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { brand } from "@/config/brand";
import { LIST_PAGE_SIZE, getNextPageParam } from "@/features/links/list-query";
import { LinkList, LinkListSkeleton } from "@/features/links/ui/link-list";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `My links · ${brand.name}` };

export default function MyLinksPage() {
  prefetch(trpc.links.list.infiniteQueryOptions({ limit: LIST_PAGE_SIZE }, { getNextPageParam }));
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageTitle>My links</PageTitle>
      <section aria-labelledby="page-title">
        <HydrateClient>
          <QueryErrorBoundary message="Couldn't load your links.">
            <Suspense fallback={<LinkListSkeleton />}>
              <LinkList />
            </Suspense>
          </QueryErrorBoundary>
        </HydrateClient>
      </section>
    </div>
  );
}
