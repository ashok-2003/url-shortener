import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PRESET_DURATION_MS, createLinkInput } from "@/features/links/schema";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

const URL_OK = "https://example.com";

function parseExpiry(expiry: unknown) {
  return createLinkInput.safeParse({ url: URL_OK, expiry });
}

function expiryErrors(expiry: unknown) {
  const result = parseExpiry(expiry);
  if (result.success) return null;
  return z.flattenError(result.error).fieldErrors.expiry;
}

describe("expiry", () => {
  it("preset durations", () => {
    expect(PRESET_DURATION_MS).toEqual({
      "1h": 3_600_000,
      "24h": 86_400_000,
      "7d": 604_800_000,
      "30d": 2_592_000_000,
    });
  });

  it.each([
    ["2026-11-06T12:05:00.000Z", true],
    ["2026-11-06T12:04:59.999Z", false],
    ["2027-11-06T12:00:00.000Z", true],
    ["2027-11-06T12:00:00.001Z", false],
    ["2026-11-06T17:35:00+05:30", true],
  ])("custom at %s -> ok=%s", (at, ok) => {
    expect(parseExpiry({ kind: "custom", at }).success).toBe(ok);
  });

  it.each([
    [
      { kind: "custom", at: "2026-11-06T12:04:59.999Z" },
      "Pick a time at least 5 minutes from now",
    ],
    [
      { kind: "custom", at: "2026-11-05T12:00:00Z" },
      "Pick a time at least 5 minutes from now",
    ],
    [
      { kind: "custom", at: "2027-11-06T12:00:00.001Z" },
      "Pick a date within a year",
    ],
    [{ kind: "custom", at: "" }, "Pick a valid date and time"],
    [{ kind: "custom", at: "not a date" }, "Pick a valid date and time"],
  ])("rejects %j", (expiry, message) => {
    expect(expiryErrors(expiry)).toEqual([message]);
  });

  it.each([
    [{ kind: "preset", preset: "2h" }],
    [{ kind: "forever" }],
    [{ kind: "preset" }],
  ])("rejects %j", (expiry) => {
    expect(parseExpiry(expiry).success).toBe(false);
  });

  it("defaults to never", () => {
    expect(createLinkInput.parse({ url: URL_OK }).expiry).toEqual({
      kind: "never",
    });
  });
});
