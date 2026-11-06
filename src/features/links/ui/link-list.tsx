"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LIST_PAGE_SIZE, getNextPageParam } from "@/features/links/list-query";
import { useTRPC } from "@/trpc/client";
import { LINK_GRID, LinkRow, LinkRowSkeleton } from "./link-row";

function ColumnHeader() {
  return (
    <div
      aria-hidden
      className={`hidden border-b border-hairline px-2 pb-2 text-xs text-ink-muted md:grid ${LINK_GRID}`}
    >
      <span>Slug</span>
      <span>Target</span>
      <span className="text-right">Clicks</span>
      <span>Created</span>
      <span>Expires</span>
    </div>
  );
}

export function LinkList() {
  const trpc = useTRPC();
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSuspenseInfiniteQuery(
      trpc.links.list.infiniteQueryOptions(
        { limit: LIST_PAGE_SIZE },
        { getNextPageParam },
      ),
    );
  const links = data.pages.flatMap((page) => page.items);

  return (
    <section aria-labelledby="links-title" className="space-y-3">
      <h2 id="links-title" className="text-base font-semibold text-ink">
        Your links
      </h2>
      {links.length === 0 ? (
        <p className="text-[15px] text-ink-muted">
          No links yet. Paste a URL above to make your first one.
        </p>
      ) : (
        <>
          <ColumnHeader />
          <ol className="border-t border-hairline md:border-t-0">
            {links.map((link) => (
              <LinkRow key={link.slug} link={link} />
            ))}
          </ol>
        </>
      )}
      {hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="secondary"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function LinkListSkeleton() {
  return (
    <section aria-labelledby="links-title" aria-busy="true" className="space-y-3">
      <h2 id="links-title" className="text-base font-semibold text-ink">
        Your links
      </h2>
      <ColumnHeader />
      <ol className="border-t border-hairline md:border-t-0">
        {Array.from({ length: 5 }, (_, i) => (
          <LinkRowSkeleton key={i} />
        ))}
      </ol>
    </section>
  );
}
