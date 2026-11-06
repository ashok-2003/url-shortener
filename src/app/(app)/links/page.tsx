import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTitle } from "@/components/page-title";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { brand } from "@/config/brand";
import { SEARCH_PARAM, getNextPageParam, linksListInput } from "@/features/links/list-query";
import { LinkList, LinkListSkeleton } from "@/features/links/ui/link-list";
import { LinkSearch } from "@/features/links/ui/link-search";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `My links · ${brand.name}` };

export default async function MyLinksPage({ searchParams }: PageProps<"/links">) {
  const q = (await searchParams)[SEARCH_PARAM];
  prefetch(
    trpc.links.list.infiniteQueryOptions(linksListInput(typeof q === "string" ? q : null), {
      getNextPageParam,
    }),
  );
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageTitle>My links</PageTitle>
      <section aria-labelledby="page-title" className="flex flex-col gap-4">
        <Suspense>
          <LinkSearch />
        </Suspense>
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
