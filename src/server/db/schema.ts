import "server-only";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const links = sqliteTable(
  "links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    targetUrl: text("target_url").notNull(),
    ownerId: text("owner_id").notNull(),
    clicks: integer("clicks").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    lastClickAt: integer("last_click_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("links_owner_id_idx").on(t.ownerId, t.id)],
);

export const clickEvents = sqliteTable(
  "click_events",
  {
    id: text("id").primaryKey(),
    linkId: integer("link_id")
      .notNull()
      .references(() => links.id),
    clickedAt: integer("clicked_at", { mode: "timestamp_ms" }).notNull(),
    referrer: text("referrer"),
    country: text("country"),
    deviceType: text("device_type").notNull(),
    browser: text("browser"),
    os: text("os"),
    batchId: text("batch_id").notNull(),
  },
  (t) => [
    index("click_events_link_clicked_idx").on(t.linkId, t.clickedAt),
    index("click_events_batch_link_idx").on(t.batchId, t.linkId),
  ],
);

export type LinkRow = typeof links.$inferSelect;
export type ClickEventRow = typeof clickEvents.$inferSelect;
