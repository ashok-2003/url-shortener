import Link from "next/link";
import type { AnalyticsOverview } from "@/features/analytics/schema";
import { detailHref } from "@/features/links/detail-param";
import { formatCount, formatDisplayUrl } from "@/features/links/format";

/** Ranked by all-time clicks; each row opens the link's detail sheet over this tab. */
export function TopLinksList({ links }: { links: AnalyticsOverview["topLinks"] }) {
  const top = Math.max(1, links[0]?.clicks ?? 0);
  return (
    <section aria-labelledby="top-links-title" className="flex flex-col gap-2">
      <h2 id="top-links-title" className="text-base/6 font-semibold">
        Top links
      </h2>
      <ol className="flex flex-col divide-y divide-hairline border-y border-hairline">
        {links.map((link) => (
          <li key={link.slug}>
            <Link
              href={detailHref(link.slug)}
              scroll={false}
              aria-label={`${link.slug}, ${formatCount(link.clicks)} clicks, opens details`}
              className="flex min-h-11 flex-col gap-1.5 px-2 py-2.5 outline-none transition-colors duration-150 ease-out hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="shrink-0 font-mono text-sm tabular-nums">{link.slug}</span>
                  <span className="min-w-0 truncate text-sm text-ink-muted">
                    {formatDisplayUrl(link.targetUrl)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums">
                  {formatCount(link.clicks)}
                </span>
              </span>
              <span aria-hidden className="h-1 rounded-full bg-surface">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(link.clicks / top) * 100}%` }}
                />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
