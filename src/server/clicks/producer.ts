import "server-only";
import { REDIRECT } from "@/server/config";
import type { ClickMessage } from "./types";

const COUNTRY_PATTERN = /^[A-Z0-9]{2}$/;

function referrerHostOf(request: Request): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Builds the queue message for one click. Keeps only the referrer host, a
 * validated country and a truncated user agent. It never reads an IP header.
 */
export function buildClickMessage(
  request: Request,
  cf: { country?: string | null } | null | undefined,
  linkId: number,
  now: number,
): ClickMessage {
  const country = cf?.country;
  const userAgent = request.headers.get("user-agent");
  return {
    clickId: crypto.randomUUID(),
    linkId,
    clickedAt: now,
    referrerHost: referrerHostOf(request),
    country:
      typeof country === "string" && COUNTRY_PATTERN.test(country)
        ? country
        : null,
    userAgent: userAgent
      ? userAgent.slice(0, REDIRECT.maxUserAgentLength)
      : null,
  };
}
