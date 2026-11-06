import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { Skeleton } from "@/components/ui/skeleton";
import { detailHref } from "@/features/links/detail-param";
import { formatCount, formatDisplayUrl } from "@/features/links/format";
import type { LinkSummary } from "@/features/links/schema";
import { ExpiryBadge } from "./expiry-badge";

/** Shared by the header row, the rows and the skeleton so columns line up. */
export const LINK_GRID =
  "md:grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_6.5rem_9.5rem] md:gap-x-4";

export function LinkColumnHeader() {
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

export function LinkRow({ link }: { link: LinkSummary }) {
  const noun = link.clicks === 1 ? "click" : "clicks";
  return (
    <li className="border-b border-hairline last:border-b-0">
      <Link
        href={detailHref(link.slug)}
        scroll={false}
        aria-label={`${link.slug}, ${formatCount(link.clicks)} ${noun}, opens details`}
        className={`grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-2 py-2.5 outline-none transition-colors duration-150 ease-out hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:py-2 ${LINK_GRID}`}
      >
        <span className="font-mono text-sm tabular-nums text-ink">{link.slug}</span>
        <span className="col-start-2 row-start-1 text-right font-mono text-sm tabular-nums text-ink md:col-start-3">
          {formatCount(link.clicks)}
        </span>
        <span className="col-span-2 row-start-2 flex min-w-0 items-center gap-3 md:contents">
          <span className="min-w-0 flex-1 truncate text-sm text-ink-muted md:col-start-2 md:row-start-1">
            {formatDisplayUrl(link.targetUrl)}
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted md:col-start-4 md:row-start-1 md:text-sm">
            <LocalTime iso={link.createdAt} format="short-date" />
          </span>
          <span className="shrink-0 empty:hidden md:col-start-5 md:row-start-1">
            <ExpiryBadge expiresAt={link.expiresAt} isExpired={link.isExpired} />
          </span>
        </span>
      </Link>
    </li>
  );
}

export function LinkRowSkeleton() {
  return (
    <li
      aria-hidden
      className={`grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-hairline px-2 py-2.5 last:border-b-0 md:py-2 ${LINK_GRID}`}
    >
      <Skeleton className="h-4 w-20" />
      <Skeleton className="col-start-2 row-start-1 h-4 w-8 md:col-start-3 md:justify-self-end" />
      <span className="col-span-2 row-start-2 flex items-center gap-3 md:contents">
        <Skeleton className="h-4 min-w-0 flex-1 md:col-start-2 md:row-start-1" />
        <Skeleton className="h-4 w-14 md:col-start-4 md:row-start-1" />
        <Skeleton className="h-5 w-24 md:col-start-5 md:row-start-1" />
      </span>
    </li>
  );
}
