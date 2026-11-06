import { LIST_PAGE_SIZE, getNextPageParam } from "@/features/links/list-query";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { LinkProbe } from "./_probe/link-probe";

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
    <HydrateClient>
      <LinkProbe />
    </HydrateClient>
  );
}
