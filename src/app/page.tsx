import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { LIST_PAGE_SIZE, getNextPageParam } from "@/features/links/list-query";
import { CreateLinkForm } from "@/features/links/ui/create-link-form";
import { LinkDetailSheet } from "@/features/links/ui/link-detail-sheet";
import { LinkList, LinkListSkeleton } from "@/features/links/ui/link-list";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// Per-user and request-dependent (spec section 3): never prerender.
export const dynamic = "force-dynamic";

export default function Home() {
  prefetch(
    trpc.links.list.infiniteQueryOptions(
      { limit: LIST_PAGE_SIZE },
      { getNextPageParam },
    ),
  );
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 md:gap-12 md:px-6 md:py-12 lg:px-8">
      <AppHeader />
      <section aria-label="Shorten a link">
        <CreateLinkForm />
      </section>
      <section aria-labelledby="links-title">
        <HydrateClient>
          <QueryErrorBoundary message="Couldn't load your links.">
            <Suspense fallback={<LinkListSkeleton />}>
              <LinkList />
            </Suspense>
          </QueryErrorBoundary>
        </HydrateClient>
      </section>
      <Suspense>
        <LinkDetailSheet />
      </Suspense>
    </main>
  );
}
