import type { ListLinksOutput } from "./schema";

export const LIST_PAGE_SIZE = 20;

export const getNextPageParam = (last: ListLinksOutput) =>
  last.nextCursor ?? undefined;
