import type { ListLinksOutput } from "./schema";

export const LIST_PAGE_SIZE = 20;
/** Home's "Recent links": a plain (non-infinite) `links.list` query of this size. */
export const RECENT_LIMIT = 5;

export const getNextPageParam = (last: ListLinksOutput) =>
  last.nextCursor ?? undefined;
