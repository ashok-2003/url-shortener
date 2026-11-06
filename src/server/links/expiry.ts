import "server-only";
import { type ExpiryInput, PRESET_DURATION_MS } from "@/features/links/schema";

/** Resolves validated expiry input to ms since the epoch, or null for never. */
export function resolveExpiresAt(expiry: ExpiryInput, now: number): number | null {
  switch (expiry.kind) {
    case "never":
      return null;
    case "preset":
      return now + PRESET_DURATION_MS[expiry.preset];
    case "custom":
      return Date.parse(expiry.at);
  }
}

export function isExpired(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && now >= expiresAt;
}
