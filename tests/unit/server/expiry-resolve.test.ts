import { expect, it } from "vitest";
import type { ExpiryInput } from "@/features/links/schema";
import { isExpired, resolveExpiresAt } from "@/server/links/expiry";

const now = Date.parse("2026-11-06T12:00:00Z");

it.each<[ExpiryInput, string | null]>([
  [{ kind: "never" }, null],
  [{ kind: "preset", preset: "1h" }, "2026-11-06T13:00:00.000Z"],
  [{ kind: "preset", preset: "24h" }, "2026-11-07T12:00:00.000Z"],
  [{ kind: "preset", preset: "7d" }, "2026-11-13T12:00:00.000Z"],
  [{ kind: "preset", preset: "30d" }, "2026-12-06T12:00:00.000Z"],
  [{ kind: "custom", at: "2026-11-06T12:30:00Z" }, "2026-11-06T12:30:00.000Z"],
])("resolveExpiresAt(%j)", (expiry, iso) => {
  const result = resolveExpiresAt(expiry, now);
  if (iso === null) expect(result).toBeNull();
  else expect(new Date(result as number).toISOString()).toBe(iso);
});

it("isExpired boundaries", () => {
  expect(isExpired(null, 5)).toBe(false);
  expect(isExpired(1000, 999)).toBe(false);
  expect(isExpired(1000, 1000)).toBe(true);
  expect(isExpired(1000, 1001)).toBe(true);
});
