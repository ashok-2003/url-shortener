"use client";

import { describeExpiry, formatShortDate } from "@/features/links/format";
import { useNow } from "@/hooks/use-now";

type Props = {
  iso: string;
  format: "short-date" | "date-time" | "relative-expiry";
  expired?: boolean;
};

const dateTime = (iso: string, timeZone?: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  })
    .format(new Date(iso))
    .replace(/\bAM\b/, "am")
    .replace(/\bPM\b/, "pm");

/**
 * Hydration-safe time. The server and the first client render use UTC and no
 * clock, so they always agree. After hydration it switches to the browser's
 * zone and the real "now" (minute resolution, ticking).
 */
export function LocalTime({ iso, format, expired = false }: Props) {
  const now = useNow();
  const hydrated = now !== null;
  const timeZone = hydrated ? undefined : "UTC";
  // Before hydration there is no clock: pretend "now" is the date itself, so
  // the year is omitted and relative text falls back to a plain date.
  const reference = now ?? new Date(iso);

  let text: string;
  if (format === "short-date") {
    text = formatShortDate(iso, reference, timeZone);
  } else if (format === "date-time") {
    text = dateTime(iso, timeZone);
  } else if (!hydrated) {
    text = expired ? "Expired" : `Expires ${formatShortDate(iso, reference, "UTC")}`;
  } else {
    text = describeExpiry({ expiresAt: iso, isExpired: expired }, reference).label;
  }

  return <time dateTime={iso}>{text}</time>;
}
