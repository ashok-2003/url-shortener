"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LIST_PAGE_SIZE, getNextPageParam } from "@/features/links/list-query";
import { useTRPC } from "@/trpc/client";
import Link from "next/link";
import { LinkColumnHeader, LinkRow, LinkRowSkeleton } from "./link-row";

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
    <div className="space-y-3">
      {links.length === 0 ? (
        <p className="text-[15px] text-ink-muted">
          No links yet.{" "}
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            Make your first one on Home.
          </Link>
        </p>
      ) : (
        <>
          <LinkColumnHeader />
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
    </div>
  );
}

export function LinkListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <LinkColumnHeader />
      <ol className="border-t border-hairline md:border-t-0">
        {Array.from({ length: 5 }, (_, i) => (
          <LinkRowSkeleton key={i} />
        ))}
      </ol>
    </div>
  );
}
