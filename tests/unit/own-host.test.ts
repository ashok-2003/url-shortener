import { describe, expect, it } from "vitest";
import { assertNotOwnHost } from "@/server/links/guards";

const BASE = "https://sho.rt";

describe("assertNotOwnHost", () => {
  it.each([
    "https://sho.rt/x",
    "https://SHO.RT/x",
    "https://sho.rt:443/x",
    // Known finding: a trailing dot is the same host in DNS, but slips past.
    "https://sho.rt./x",
    "https://sho.rt.:443/x",
  ])("rejects %s", (url) => {
    expect(() => assertNotOwnHost(url, BASE)).toThrow(
      "That's already a short link from this app",
    );
  });

  it.each([
    "https://notsho.rt/x",
    "https://sho.rt.evil.com/x",
    "https://sho.rt:8443/x",
  ])("allows %s", (url) => {
    expect(() => assertNotOwnHost(url, BASE)).not.toThrow();
  });
});
