import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  SLUG_PATTERN,
  createLinkInput,
  listLinksInput,
} from "@/features/links/schema";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

function fieldErrors(input: unknown) {
  const result = createLinkInput.safeParse(input);
  if (result.success) return null;
  return z.flattenError(result.error).fieldErrors as Record<string, string[]>;
}

describe("url", () => {
  it.each([
    ["", "url", "Paste a link to shorten"],
    ["example.com", "url", "Enter a full link, starting with https://"],
    ["http://example.com", "url", "Use an https:// link"],
    ["javascript:alert(1)", "url", "Use an https:// link"],
    ["data:text/html,hi", "url", "Use an https:// link"],
    [
      "https://user:pass@example.com",
      "url",
      "Links with a username or password aren't allowed",
    ],
    [
      "https://example.com/" + "a".repeat(2030),
      "url",
      "Links can be at most 2048 characters",
    ],
  ])("rejects %j", (url, field, message) => {
    expect(fieldErrors({ url })).toEqual({ [field]: [message] });
  });

  it("trims and accepts https", () => {
    expect(
      createLinkInput.parse({ url: "  https://example.com/a?b=1  " }),
    ).toEqual({ url: "https://example.com/a?b=1", expiry: { kind: "never" } });
  });
});

describe("expiry", () => {
  it.each([
    [
      { kind: "custom", at: "2026-11-06T12:04:00Z" },
      "Pick a time at least 5 minutes from now",
    ],
    [
      { kind: "custom", at: "2027-11-07T12:00:00Z" },
      "Pick a date within a year",
    ],
    [{ kind: "custom", at: "not a date" }, "Pick a valid date and time"],
    [{ kind: "preset", preset: "2h" }, undefined],
  ])("rejects expiry %j", (expiry, message) => {
    const errors = fieldErrors({ url: "https://example.com", expiry });
    expect(errors).not.toBeNull();
    if (message) expect(errors).toEqual({ expiry: [message] });
    else expect(errors?.expiry?.length).toBeGreaterThan(0);
  });

  it.each([
    { kind: "never" },
    { kind: "preset", preset: "1h" },
    { kind: "preset", preset: "30d" },
    { kind: "custom", at: "2026-11-06T13:00:00Z" },
  ])("accepts %j", (expiry) => {
    expect(
      createLinkInput.safeParse({ url: "https://example.com", expiry }).success,
    ).toBe(true);
  });
});

it("SLUG_PATTERN", () => {
  expect(SLUG_PATTERN.test("aZ09xYz")).toBe(true);
  expect(SLUG_PATTERN.test("api")).toBe(false);
  expect(SLUG_PATTERN.test("abc-123")).toBe(false);
});

it("listLinksInput defaults limit to 20 and rejects 51", () => {
  expect(listLinksInput.parse({}).limit).toBe(20);
  expect(listLinksInput.safeParse({ limit: 51 }).success).toBe(false);
});
