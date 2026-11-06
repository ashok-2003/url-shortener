import "server-only";
import { REDIRECT } from "@/server/config";
import { log } from "@/server/log";

export type CachedLink = {
  id: number;
  targetUrl: string;
  /** Epoch milliseconds, or `null` for a link that never expires. */
  expiresAt: number | null;
};

export function cacheKey(slug: string): string {
  return `${REDIRECT.cacheKeyPrefix}${slug}`;
}

/** KV needs at least 60 s; we also never keep an entry longer than a week. */
export function cacheTtlSeconds(
  expiresAt: number | null,
  now: number,
): number {
  if (expiresAt === null) return REDIRECT.cacheMaxTtlSeconds;
  const remaining = Math.ceil((expiresAt - now) / 1000);
  return Math.max(
    REDIRECT.cacheMinTtlSeconds,
    Math.min(REDIRECT.cacheMaxTtlSeconds, remaining),
  );
}

function isCachedLink(value: unknown): value is CachedLink {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    Number.isFinite(v.id) &&
    typeof v.targetUrl === "string" &&
    (v.expiresAt === null || typeof v.expiresAt === "number")
  );
}

/** Never rejects: any failure is logged and treated as a cache miss. */
export async function readCachedLink(
  kv: KVNamespace,
  slug: string,
): Promise<CachedLink | null> {
  let raw: string | null;
  try {
    raw = await kv.get(cacheKey(slug), "text");
  } catch (error) {
    log.error("kv.read_failed", { slug, error });
    return null;
  }
  if (raw === null || raw === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    log.error("kv.bad_value", { slug, error });
    return null;
  }
  if (!isCachedLink(parsed)) {
    log.error("kv.bad_value", { slug });
    return null;
  }
  return {
    id: parsed.id,
    targetUrl: parsed.targetUrl,
    expiresAt: parsed.expiresAt,
  };
}

/** Never rejects: a failed fill only costs the next request a D1 read. */
export async function fillCache(
  kv: KVNamespace,
  slug: string,
  link: CachedLink,
  now: number,
): Promise<void> {
  try {
    await kv.put(cacheKey(slug), JSON.stringify(link), {
      expirationTtl: cacheTtlSeconds(link.expiresAt, now),
    });
  } catch (error) {
    log.warn("kv.fill_failed", { slug, error });
  }
}
