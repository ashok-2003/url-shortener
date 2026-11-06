"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DETAIL_PARAM } from "@/features/links/detail-param";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useTRPC } from "@/trpc/client";
import { LinkStatsSkeleton, LinkStatsView } from "./link-stats-view";

export function LinkDetailSheet() {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const param = useSearchParams().get(DETAIL_PARAM);
  const open = param !== null;
  const isWide = useMediaQuery("(min-width: 768px)");

  // Keep the last slug while the sheet animates closed so content doesn't blank.
  const [kept, setKept] = useState<string | null>(param);
  if (param !== null && param !== kept) setKept(param);
  const slug = param ?? kept ?? "";

  const query = useQuery(
    trpc.links.stats.queryOptions(
      { slug },
      {
        enabled: open,
        refetchInterval: 15_000,
        // A missing or malformed slug won't appear on retry; show it at once.
        retry: (count, error) =>
          error.data?.code !== "NOT_FOUND" && error.data?.code !== "BAD_REQUEST" && count < 2,
      },
    ),
  );

  const code = query.error?.data?.code;
  const notFound = code === "NOT_FOUND" || code === "BAD_REQUEST";

  function onOpenChange(next: boolean) {
    if (!next) router.replace(pathname, { scroll: false });
  }

  let body;
  if (query.data) {
    body = <LinkStatsView stats={query.data} />;
  } else if (query.isError && notFound) {
    body = <p role="alert">This link doesn&apos;t exist.</p>;
  } else if (query.isError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>Couldn&apos;t load this link&apos;s numbers.</p>
        <Button type="button" variant="secondary" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else {
    body = <LinkStatsSkeleton />;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isWide ? "right" : "bottom"}
        className="gap-0 p-0 data-[side=right]:w-[480px] data-[side=right]:max-w-full data-[side=right]:sm:max-w-[480px]"
      >
        {isWide ? null : (
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hairline" />
        )}
        <SheetHeader className="px-4 pt-4 pr-14 pb-3 md:px-6">
          <SheetTitle className="text-base font-semibold">Link details</SheetTitle>
          <SheetDescription className="sr-only">
            Click totals, daily clicks and top sources for this short link.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 md:px-6">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
