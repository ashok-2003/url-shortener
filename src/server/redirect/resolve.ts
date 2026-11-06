import "server-only";
import { SLUG_PATTERN } from "@/features/links/schema";
import { renderStatusPage, type StatusPageKind } from "@/features/status-pages/render";
import { buildClickMessage } from "@/server/clicks/producer";
import { recordClicks } from "@/server/clicks/record";
import type { ClickMessage } from "@/server/clicks/types";
import { REDIRECT } from "@/server/config";
import { log } from "@/server/log";
import { fillCache, readCachedLink, type CachedLink } from "./cache";

const NO_STORE = "private, no-store";

/**
 * GET /{slug} (spec section 6): KV → (miss) D1 → 302, with the click recorded after the
 * response. Never 301 (browsers would cache it and later clicks would never be counted),
 * never caches "not found", checks expiry on every request, and answers 503 rather than
 * 404 when D1 can't be reached.
 */
export async function resolveRedirect(args: {
  request: Request;
  env: CloudflareEnv;
  waitUntil: (p: Promise<unknown>) => void;
  cf?: { country?: string | null } | null;
}): Promise<Response> {
  const { request, env, waitUntil, cf } = args;
  const started = Date.now();
  const url = new URL(request.url);
  const slug = url.pathname.slice(1);

  const page = (kind: StatusPageKind, status: number, extra: Record<string, string> = {}) =>
    new Response(renderStatusPage(kind, { homeUrl: `${url.origin}/`, retryUrl: request.url }), {
      status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": NO_STORE, ...extra },
    });

  if (!SLUG_PATTERN.test(slug)) return page("not-found", 404);

  let link: CachedLink | null = await readCachedLink(env.LINKS_CACHE, slug);
  const cacheHit = link !== null;
  if (!link) {
    try {
      const row = await env.DB.prepare("SELECT id, target_url, expires_at FROM links WHERE slug = ?")
        .bind(slug)
        .first<{ id: number; target_url: string; expires_at: number | null }>();
      if (!row) return page("not-found", 404);
      link = { id: row.id, targetUrl: row.target_url, expiresAt: row.expires_at };
      waitUntil(fillCache(env.LINKS_CACHE, slug, link, started));
    } catch (error) {
      log.error("redirect.d1_failed", { slug, error });
      return page("unavailable", 503, { "retry-after": String(REDIRECT.retryAfterSeconds) });
    }
  }

  if (link.expiresAt !== null && started >= link.expiresAt) return page("expired", 410);

  if (request.method === "GET") {
    waitUntil(enqueueClick(env, buildClickMessage(request, cf, link.id, started)));
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: link.targetUrl,
      "cache-control": NO_STORE,
      "server-timing": `${cacheHit ? "kv" : "d1"};desc="lookup", total;dur=${Date.now() - started}`,
    },
  });
}

/**
 * Production: put the click on the queue; worker.ts's consumer stores it in batches.
 * `next dev` runs no queue consumer, so there the click is stored directly (still after the response).
 */
async function enqueueClick(env: CloudflareEnv, message: ClickMessage): Promise<void> {
  try {
    if (process.env.NODE_ENV === "development" || !env.CLICKS) {
      await recordClicks(env.DB, [message]);
    } else {
      await env.CLICKS.send(message);
    }
  } catch (error) {
    log.error("click.enqueue_failed", { linkId: message.linkId, error });
  }
}
