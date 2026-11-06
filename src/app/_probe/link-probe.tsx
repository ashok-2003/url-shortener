"use client";
// TEMP: proves prefetch + hydration work; workstream B replaces this.
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { LIST_PAGE_SIZE, getNextPageParam } from "@/features/links/list-query";
import { useTRPC } from "@/trpc/client";

function Slugs() {
  const trpc = useTRPC();
  const { data } = useSuspenseInfiniteQuery(
    trpc.links.list.infiniteQueryOptions(
      { limit: LIST_PAGE_SIZE },
      { getNextPageParam },
    ),
  );
  return (
    <ul>
      {data.pages.flatMap((p) => p.items).map((l) => (
        <li key={l.slug}>{l.slug}</li>
      ))}
    </ul>
  );
}

export function LinkProbe() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Slugs />
    </Suspense>
  );
}
