import { describe, expect, it } from "vitest";
import {
  countryName,
  describeExpiry,
  deviceLabel,
  formatCount,
  formatDisplayUrl,
  formatShortDate,
  referrerLabel,
} from "@/features/links/format";
import { DETAIL_PARAM, detailHref } from "@/features/links/detail-param";
import { rateLimitMessage, secondsLeft } from "@/features/links/create-error";

const now = new Date("2026-11-06T12:00:00Z");

describe("formatDisplayUrl", () => {
  it("drops the scheme and a trailing slash", () => {
    expect(formatDisplayUrl("https://www.example.com/a/b?x=1")).toBe("www.example.com/a/b?x=1");
    expect(formatDisplayUrl("https://example.com/")).toBe("example.com");
  });
});

describe("formatShortDate", () => {
  it("omits the year in the current year", () => {
    expect(formatShortDate("2026-11-06T09:00:00Z", now, "UTC")).toBe("6 Nov");
  });
  it("includes the year otherwise", () => {
    expect(formatShortDate("2025-12-31T09:00:00Z", now, "UTC")).toBe("31 Dec 2025");
  });
});

describe("describeExpiry", () => {
  const d = (expiresAt: string | null, isExpired = false) =>
    describeExpiry({ expiresAt, isExpired }, now, "UTC");
  it("handles never", () => {
    expect(d(null)).toEqual({ label: "Never expires", tone: "muted" });
  });
  it("shows hours under a day", () => {
    expect(d("2026-11-06T15:00:00Z")).toEqual({ label: "Expires in 3 h", tone: "amber" });
  });
  it("shows minutes under an hour", () => {
    expect(d("2026-11-06T12:45:00Z")).toEqual({ label: "Expires in 45 min", tone: "amber" });
  });
  it("rounds minutes up, at least 1", () => {
    expect(d("2026-11-06T12:00:20Z")).toEqual({ label: "Expires in 1 min", tone: "amber" });
  });
  it("shows a date beyond a day", () => {
    expect(d("2026-11-08T12:00:00Z")).toEqual({ label: "Expires 8 Nov", tone: "muted" });
  });
  it("is expired when the time has passed", () => {
    expect(d("2026-11-05T12:00:00Z")).toEqual({ label: "Expired", tone: "neutral" });
  });
  it("trusts isExpired", () => {
    expect(d("2026-11-08T12:00:00Z", true).label).toBe("Expired");
  });
});

describe("small formatters", () => {
  it("formats", () => {
    expect(formatCount(1284)).toBe("1,284");
    expect(countryName("IN")).toBe("India");
    expect(countryName(null)).toBe("Unknown");
    expect(referrerLabel(null)).toBe("Direct");
    expect(deviceLabel("mobile")).toBe("Mobile");
  });
});

describe("rate limit helpers", () => {
  it("builds the message", () => {
    expect(rateLimitMessage(42)).toBe("You've made 5 links in the last minute. Try again in 42 s");
    expect(rateLimitMessage(null)).toBe("You've made 5 links in the last minute. Try again in a minute.");
  });
  it("counts down to zero", () => {
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(9_000, 10_000)).toBe(0);
  });
});

describe("detail param", () => {
  it("builds the href", () => {
    expect(DETAIL_PARAM).toBe("link");
    expect(detailHref("demo023")).toBe("?link=demo023");
  });
});
