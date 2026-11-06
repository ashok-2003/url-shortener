"use client";

import { LocalTime } from "@/components/local-time";
import { StatusBadge } from "@/components/status-badge";
import { describeExpiry } from "@/features/links/format";
import { useNow } from "@/hooks/use-now";

type Props = { expiresAt: string | null; isExpired: boolean };

/**
 * Amber "Expires in …" under 24 h, neutral "Expired", muted date otherwise,
 * nothing while the link never expires. The tone needs the clock, so before
 * hydration it falls back to the muted date (same text LocalTime renders).
 */
export function ExpiryBadge({ expiresAt, isExpired }: Props) {
  const now = useNow();
  if (expiresAt === null && !isExpired) return null;

  const iso = expiresAt ?? "";
  const tone = isExpired
    ? "neutral"
    : now
      ? describeExpiry({ expiresAt, isExpired }, now).tone
      : "muted";

  const time = <LocalTime iso={iso} format="relative-expiry" expired={isExpired} />;

  if (tone === "amber") return <StatusBadge tone="amber">{time}</StatusBadge>;
  if (tone === "neutral") return <StatusBadge tone="neutral">{time}</StatusBadge>;
  return <span className="text-xs whitespace-nowrap text-ink-muted md:text-sm">{time}</span>;
}
