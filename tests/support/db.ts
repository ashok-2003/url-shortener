import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import {
  clickEvents,
  links,
  type ClickEventRow,
  type LinkRow,
} from "@/server/db/schema";
import { DEMO_USER_ID } from "@/server/trpc/context";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// D1 allows at most 100 bound parameters per statement; a click_events row
// binds 9, so inserts go in chunks of 10 rows.
const ROWS_PER_INSERT = 10;

/** A test-only slug. Not the app's generator, which C owns. */
function randomSlug(): string {
  let slug = "";
  for (let i = 0; i < 7; i++) {
    slug += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return slug;
}

export function testDb(): Db {
  return getDb(env.DB);
}

/**
 * Deletes every row from every app table, and every KV key. Tables are found
 * at run time, so a table added later (the owner's rate limiter, say) is
 * cleared too. Migration bookkeeping and SQLite's own tables are kept.
 */
export async function clearStorage(): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'`,
  ).all<{ name: string }>();
  // Foreign keys are checked at commit, so the delete order doesn't matter.
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = on"),
    ...results.map((t) => env.DB.prepare(`DELETE FROM "${t.name}"`)),
  ]);
  let cursor: string | undefined;
  do {
    const page = await env.LINKS_CACHE.list({ cursor });
    await Promise.all(page.keys.map((k) => env.LINKS_CACHE.delete(k.name)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

/** Inserts a link straight into D1, owned by `user_demo` unless overridden. */
export async function insertLink(
  overrides: Partial<typeof links.$inferInsert> = {},
): Promise<LinkRow> {
  const slug = overrides.slug ?? randomSlug();
  const [row] = await testDb()
    .insert(links)
    .values({
      slug,
      targetUrl: `https://example.com/${slug}`,
      ownerId: DEMO_USER_ID,
      clicks: 0,
      createdAt: new Date(),
      ...overrides,
    })
    .returning();
  return row;
}

/**
 * Inserts click events for one link and keeps `links.clicks` and
 * `links.last_click_at` in step with them, as the queue consumer would.
 */
export async function insertClicks(
  linkId: number,
  events: Partial<Omit<ClickEventRow, "linkId">>[],
): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => ({
    id: crypto.randomUUID(),
    clickedAt: new Date(),
    referrer: null,
    country: null,
    deviceType: "desktop",
    browser: null,
    os: null,
    batchId: "seed",
    ...e,
    linkId,
  }));
  const db = testDb();
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    await db.insert(clickEvents).values(rows.slice(i, i + ROWS_PER_INSERT));
  }
  const newest = Math.max(...rows.map((r) => r.clickedAt.getTime()));
  await db
    .update(links)
    .set({
      clicks: sql`${links.clicks} + ${rows.length}`,
      lastClickAt: sql`max(coalesce(${links.lastClickAt}, 0), ${newest})`,
    })
    .where(eq(links.id, linkId));
}
