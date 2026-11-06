import "server-only";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import type { LinkStats, LinkSummary, ListLinksOutput } from "@/features/links/schema";
import { aggregateClicks } from "@/server/clicks/aggregate";
import { LINKS } from "@/server/config";
import { links, type LinkRow } from "@/server/db/schema";
import type { Context } from "@/server/trpc/context";
import { isExpired, resolveExpiresAt } from "./expiry";
import { generateSlug } from "./slug";
import type { ExpiryInput } from "@/features/links/schema";

export function toSummary(row: LinkRow, baseUrl: string, now: number): LinkSummary {
  const expiresAt = row.expiresAt ? row.expiresAt.getTime() : null;
  return {
    slug: row.slug,
    shortUrl: `${baseUrl}/${row.slug}`,
    targetUrl: row.targetUrl,
    clicks: row.clicks,
    createdAt: row.createdAt.toISOString(),
    expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
    isExpired: isExpired(expiresAt, now),
  };
}

const isSlugCollision = (error: unknown) =>
  String((error as { cause?: unknown })?.cause ?? error).includes("UNIQUE constraint failed: links.slug");

export async function createLink(
  ctx: Context,
  input: { url: string; expiry: ExpiryInput },
): Promise<LinkSummary> {
  const now = Date.now();
  const expiresAt = resolveExpiresAt(input.expiry, now);
  for (let attempt = 1; attempt <= LINKS.maxSlugAttempts; attempt++) {
    try {
      const [row] = await ctx.db
        .insert(links)
        .values({
          slug: generateSlug(),
          targetUrl: input.url,
          ownerId: ctx.ownerId,
          createdAt: new Date(now),
          expiresAt: expiresAt === null ? null : new Date(expiresAt),
        })
        .returning();
      return toSummary(row, ctx.baseUrl, now);
    } catch (error) {
      if (!isSlugCollision(error)) throw error;
    }
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't pick a free short link." });
}

export async function listLinks(
  ctx: Context,
  input: { cursor?: number | null; limit: number },
): Promise<ListLinksOutput> {
  const rows = await ctx.db
    .select()
    .from(links)
    .where(and(eq(links.ownerId, ctx.ownerId), input.cursor ? lt(links.id, input.cursor) : undefined))
    .orderBy(desc(links.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const now = Date.now();
  return {
    items: page.map((row) => toSummary(row, ctx.baseUrl, now)),
    nextCursor: rows.length > input.limit ? page[page.length - 1].id : null,
  };
}

/** Someone else's link behaves exactly like a missing one (spec section 8). */
export async function linkStats(ctx: Context, slug: string): Promise<LinkStats> {
  const [row] = await ctx.db
    .select()
    .from(links)
    .where(and(eq(links.slug, slug), eq(links.ownerId, ctx.ownerId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "This link doesn't exist." });

  const now = Date.now();
  const agg = await aggregateClicks(ctx.env.DB, { ownerId: ctx.ownerId, linkId: row.id }, now);
  return {
    link: toSummary(row, ctx.baseUrl, now),
    lastClickAt: row.lastClickAt ? row.lastClickAt.toISOString() : null,
    totals: { all: row.clicks, last24h: agg.last24h, last7d: agg.last7d },
    daily: agg.daily,
    referrers: agg.referrers,
    countries: agg.countries,
    devices: agg.devices,
  };
}
