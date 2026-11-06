import { describe, expect, it } from "vitest";
import { buildClickMessage } from "@/server/clicks/producer";

const req = (h: Record<string, string>) =>
  new Request("https://sho.rt/aZ09xYz", { headers: h });

describe("buildClickMessage", () => {
  it("keeps only the referrer host", () => {
    expect(
      buildClickMessage(
        req({ referer: "https://t.co/abc?email=a@b.com" }),
        null,
        1,
        5,
      ).referrerHost,
    ).toBe("t.co");
  });

  it("unparseable referrer gives null", () => {
    expect(
      buildClickMessage(req({ referer: "not a url" }), null, 1, 5).referrerHost,
    ).toBeNull();
  });

  it("missing referrer gives null", () => {
    expect(buildClickMessage(req({}), null, 1, 5).referrerHost).toBeNull();
  });

  it("country: two letters or digits, else null", () => {
    expect(buildClickMessage(req({}), { country: "IN" }, 1, 5).country).toBe("IN");
    expect(buildClickMessage(req({}), { country: "T1" }, 1, 5).country).toBe("T1");
    expect(buildClickMessage(req({}), { country: "XYZ" }, 1, 5).country).toBeNull();
    expect(buildClickMessage(req({}), { country: "in" }, 1, 5).country).toBeNull();
    expect(buildClickMessage(req({}), { country: null }, 1, 5).country).toBeNull();
    expect(buildClickMessage(req({}), {}, 1, 5).country).toBeNull();
    expect(buildClickMessage(req({}), undefined, 1, 5).country).toBeNull();
    expect(buildClickMessage(req({}), null, 1, 5).country).toBeNull();
  });

  it("truncates the user agent to 512 characters", () => {
    const m = buildClickMessage(req({ "user-agent": "a".repeat(600) }), null, 1, 5);
    expect(m.userAgent).toBe("a".repeat(512));
  });

  it("keeps a short user agent as is, and null when absent", () => {
    expect(
      buildClickMessage(req({ "user-agent": "curl/8" }), null, 1, 5).userAgent,
    ).toBe("curl/8");
    expect(buildClickMessage(req({}), null, 1, 5).userAgent).toBeNull();
  });

  it("never carries the IP", () => {
    const m = buildClickMessage(
      req({
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "203.0.113.9",
      }),
      null,
      1,
      5,
    );
    expect(JSON.stringify(m)).not.toContain("203.0.113.9");
  });

  it("clickId is a UUID, clickedAt is now, linkId is passed through", () => {
    const m = buildClickMessage(req({}), null, 42, 1234);
    expect(m.clickId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(m.clickedAt).toBe(1234);
    expect(m.linkId).toBe(42);
  });

  it("gives each message a fresh clickId", () => {
    const a = buildClickMessage(req({}), null, 1, 5);
    const b = buildClickMessage(req({}), null, 1, 5);
    expect(a.clickId).not.toBe(b.clickId);
  });
});
