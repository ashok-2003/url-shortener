import { describe, expect, it } from "vitest";
import { customBounds, toExpiryInput } from "@/features/links/expiry-choice";
import { EXPIRY_PRESETS } from "@/features/links/schema";

describe("toExpiryInput", () => {
  it("maps never", () => {
    expect(toExpiryInput("never", "")).toEqual({ kind: "never" });
  });

  it.each(EXPIRY_PRESETS)("maps the %s preset", (preset) => {
    expect(toExpiryInput(preset, "2030-01-01T10:00")).toEqual({
      kind: "preset",
      preset,
    });
  });

  it("converts a local datetime to an ISO instant", () => {
    const local = "2030-03-04T09:30";
    expect(toExpiryInput("custom", local)).toEqual({
      kind: "custom",
      at: new Date(local).toISOString(),
    });
  });

  it("passes an empty custom value through as invalid, without throwing", () => {
    expect(toExpiryInput("custom", "")).toEqual({ kind: "custom", at: "" });
  });
});

describe("customBounds", () => {
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

  it("returns datetime-local strings", () => {
    const { min, max } = customBounds(new Date(2026, 10, 6, 12, 0));
    expect(min).toMatch(pattern);
    expect(max).toMatch(pattern);
  });

  it("is now + 5 minutes and now + 365 days in local time", () => {
    const now = new Date(2026, 10, 6, 12, 0, 0);
    expect(customBounds(now)).toEqual({
      min: "2026-11-06T12:05",
      max: "2027-11-06T12:00",
    });
  });

  it("rolls over the hour and the day", () => {
    const now = new Date(2026, 11, 31, 23, 58, 0);
    expect(customBounds(now).min).toBe("2027-01-01T00:03");
  });
});
