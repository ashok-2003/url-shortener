import { CopyButton } from "@/components/copy-button";
import { ShareButton } from "@/components/share-button";
import { formatDisplayUrl } from "@/features/links/format";
import type { LinkSummary } from "@/features/links/schema";

export function CreatedLinkResult({ link }: { link: LinkSummary }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-[10px] bg-surface p-4">
      <p className="text-sm font-semibold">Link created</p>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-mono text-lg font-medium break-all">
          {formatDisplayUrl(link.shortUrl)}
        </p>
        <p className="truncate text-sm text-muted-foreground" title={link.targetUrl}>
          {formatDisplayUrl(link.targetUrl)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={link.shortUrl} />
        <ShareButton url={link.shortUrl} />
      </div>
    </div>
  );
}
