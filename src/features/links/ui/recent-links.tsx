"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RECENT_LIMIT } from "@/features/links/list-query";
import { useTRPC } from "@/trpc/client";
import { LinkColumnHeader, LinkRow, LinkRowSkeleton } from "./link-row";

function Heading() {
  return (
    <h2 id="recent-title" className="text-base font-semibold text-ink">
      Recent links
    </h2>
  );
}

/** Home's five newest links. Same options as the server prefetch in `app/(app)/page.tsx`. */
export function RecentLinks() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.links.list.queryOptions({ limit: RECENT_LIMIT }));

  return (
    <div className="space-y-3">
      <Heading />
      {data.items.length === 0 ? (
        <p className="text-[15px] text-ink-muted">
          No links yet. Paste a URL above to make your first one.
        </p>
      ) : (
        <>
          <LinkColumnHeader />
          <ol className="border-t border-hairline md:border-t-0">
            {data.items.map((link) => (
              <LinkRow key={link.slug} link={link} />
            ))}
          </ol>
          <div className="flex justify-end pt-2">
            <Button asChild variant="ink">
              <Link href="/links">
                View all links
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function RecentLinksSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <Heading />
      <LinkColumnHeader />
      <ol className="border-t border-hairline md:border-t-0">
        {Array.from({ length: RECENT_LIMIT }, (_, i) => (
          <LinkRowSkeleton key={i} />
        ))}
      </ol>
    </div>
  );
}
