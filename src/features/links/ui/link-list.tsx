"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SEARCH_PARAM, getNextPageParam, linksListInput } from "@/features/links/list-query";
import { useTRPC } from "@/trpc/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue } from "react";
import { LinkColumnHeader, LinkRow, LinkRowSkeleton } from "./link-row";

export function LinkList() {
  const trpc = useTRPC();
  const typed = useSearchParams().get(SEARCH_PARAM)?.trim() ?? "";
  // Deferred: while a new search loads, keep showing the previous results instead of the skeleton.
  const q = useDeferredValue(typed);
  const searching = q !== typed;
  // Same input as the server prefetch in app/(app)/links/page.tsx, so the hydrated cache is used.
  // abortOnUnmount hands TanStack's AbortSignal to fetch, so a cancelled search aborts its request.
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSuspenseInfiniteQuery(
      trpc.links.list.infiniteQueryOptions(linksListInput(q), {
        getNextPageParam,
        trpc: { abortOnUnmount: true },
      }),
    );
  const links = data.pages.flatMap((page) => page.items);

  return (
    <div
      aria-busy={searching}
      className={`space-y-3 transition-opacity duration-150 ease-out ${searching ? "opacity-60" : ""}`}
    >
      <p aria-live="polite" className="text-xs text-ink-muted empty:hidden">
        {searching ? "Searching…" : q ? `${links.length}${hasNextPage ? "+" : ""} matching “${q}”` : ""}
      </p>
      {links.length === 0 && q ? (
        <p className="text-[15px] text-ink-muted" role="status">
          No links match “{q}”.
        </p>
      ) : links.length === 0 ? (
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
