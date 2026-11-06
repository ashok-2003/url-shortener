import type { QueryKey } from "@tanstack/react-query";
import type { ListLinksOutput } from "./schema";

export const LIST_PAGE_SIZE = 20;
/** Home's "Recent links": a plain (non-infinite) `links.list` query of this size. */
export const RECENT_LIMIT = 5;

export const getNextPageParam = (last: ListLinksOutput) =>
  last.nextCursor ?? undefined;

/** My links' search term lives in the URL as `?q=`, so reload and Back keep it. */
export const SEARCH_PARAM = "q";

/** The list input for My links. Server prefetch and client query must build the same key. */
export function linksListInput(q?: string | null): { limit: number; q?: string } {
  const term = q?.trim();
  return term ? { limit: LIST_PAGE_SIZE, q: term } : { limit: LIST_PAGE_SIZE };
}

/** True for a My links (infinite) list query whose search term isn't `term`: safe to abort. */
export function isStaleSearch(queryKey: QueryKey, term: string): boolean {
  const meta = queryKey[1] as { type?: string; input?: { q?: string } } | undefined;
  return meta?.type === "infinite" && (meta.input?.q ?? "") !== term;
}
