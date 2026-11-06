export function formatDisplayUrl(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/\/$/, "");
}

export function formatShortDate(iso: string, now: Date, timeZone?: string): string {
  const date = new Date(iso);
  const year = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone }).format(d);
  const sameYear = year(date) === year(now);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(date);
}

export type ExpiryDescription = {
  label: string;
  tone: "muted" | "amber" | "neutral";
};

export function describeExpiry(
  link: { expiresAt: string | null; isExpired: boolean },
  now: Date,
  timeZone?: string,
): ExpiryDescription {
  if (link.expiresAt === null) {
    return link.isExpired
      ? { label: "Expired", tone: "neutral" }
      : { label: "Never expires", tone: "muted" };
  }
  const remainingMs = new Date(link.expiresAt).getTime() - now.getTime();
  if (link.isExpired || remainingMs <= 0) {
    return { label: "Expired", tone: "neutral" };
  }
  const HOUR = 3_600_000;
  if (remainingMs < HOUR) {
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return { label: `Expires in ${minutes} min`, tone: "amber" };
  }
  if (remainingMs < 24 * HOUR) {
    return { label: `Expires in ${Math.floor(remainingMs / HOUR)} h`, tone: "amber" };
  }
  return {
    label: `Expires ${formatShortDate(link.expiresAt, now, timeZone)}`,
    tone: "muted",
  };
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function referrerLabel(host: string | null): string {
  return host ? host : "Direct";
}

export function deviceLabel(type: string): string {
  if (!type) return "Unknown";
  return type.charAt(0).toUpperCase() + type.slice(1);
}
