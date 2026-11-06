import { describe, expect, it } from "vitest";
import { isStaleSearch, linksListInput } from "@/features/links/list-query";
import { listLinksInput } from "@/features/links/schema";
import { likePattern } from "@/server/links/service";

describe("My links search", () => {
  it("builds the same list input on server and client, dropping blank terms", () => {
    expect(linksListInput(null)).toEqual({ limit: 20 });
    expect(linksListInput("   ")).toEqual({ limit: 20 });
    expect(linksListInput("  docs ")).toEqual({ limit: 20, q: "docs" });
  });

  it("validates q: trimmed, at most 200 characters", () => {
    expect(listLinksInput.parse({ q: "  gh  " }).q).toBe("gh");
    expect(listLinksInput.safeParse({ q: "x".repeat(201) }).success).toBe(false);
  });

  it("escapes LIKE wildcards so they match literally", () => {
    expect(likePattern("docs")).toBe("%docs%");
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });

  it("aborts only infinite list queries for a different term", () => {
    const key = (q?: string) => [["links", "list"], { input: q ? { limit: 20, q } : { limit: 20 }, type: "infinite" }];
    expect(isStaleSearch(key("doc"), "docs")).toBe(true);
    expect(isStaleSearch(key(), "docs")).toBe(true);
    expect(isStaleSearch(key("docs"), "docs")).toBe(false);
    // Home's plain "Recent links" query is never touched.
    expect(isStaleSearch([["links", "list"], { input: { limit: 5 }, type: "query" }], "docs")).toBe(false);
  });
});
