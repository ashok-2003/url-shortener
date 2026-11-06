import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { assertNotOwnHost } from "@/server/links/guards";

const BASE = "https://sho.rt";

function rejects(url: string) {
  let caught: unknown;
  try {
    assertNotOwnHost(url, BASE);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(TRPCError);
  expect((caught as TRPCError).code).toBe("BAD_REQUEST");
}

describe("assertNotOwnHost", () => {
  it.each([
    "https://sho.rt./x",
    "https://sho.rt.:443/x",
    "https://sho.rt/x",
    "https://SHO.RT/x",
    "https://sho.rt:443/x",
  ])("rejects own host %s", (url) => {
    rejects(url);
  });

  it.each([
    "https://sho.rt.evil.com/x",
    "https://notsho.rt/x",
    "https://example.com/",
  ])("allows foreign host %s", (url) => {
    expect(() => assertNotOwnHost(url, BASE)).not.toThrow();
  });
});
