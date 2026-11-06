"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { SEARCH_PARAM, isStaleSearch } from "@/features/links/list-query";
import { useTRPC } from "@/trpc/client";

export const SEARCH_DEBOUNCE_MS = 300;

/**
 * My links' search box.
 *
 * - **Debounced:** `?q=` changes only after 300 ms without typing, so a burst of keystrokes is one request.
 * - **Aborted:** before a new term goes out, any in-flight request for an older term is cancelled.
 *   `cancelQueries` fires the query's AbortController, and the list query passes that signal to fetch
 *   (`trpc.abortOnUnmount`), so the stale HTTP request is really aborted, not just ignored.
 * - **No page refetch:** the URL is updated with `history.replaceState`, which Next.js syncs into
 *   `useSearchParams` without a server round-trip; only the tRPC list query runs.
 */
export function LinkSearch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(SEARCH_PARAM)?.trim() ?? "";
  const [value, setValue] = useState(current);

  useEffect(() => {
    const term = value.trim();
    if (term === current) return;
    const timer = setTimeout(() => {
      void queryClient.cancelQueries({
        queryKey: trpc.links.list.pathKey(),
        predicate: (query) => isStaleSearch(query.queryKey, term),
      });
      const next = new URLSearchParams(params.toString());
      if (term) next.set(SEARCH_PARAM, term);
      else next.delete(SEARCH_PARAM);
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, current, params, pathname, queryClient, trpc]);

  return (
    <div className="relative">
      <label htmlFor="link-search" className="sr-only">
        Search links
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
      />
      <Input
        id="link-search"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search by slug or URL"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setValue("");
        }}
        className="pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setValue("")}
          className="absolute top-1/2 right-0 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
