import { describe, expect, it } from "vitest";
import { parseUserAgent } from "@/server/clicks/user-agent";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  winChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  winEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.67",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  linuxFirefox:
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0",
  googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  facebook:
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  slackbot: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  curl: "curl/8.4.0",
  // iPadOS 13+ Safari sends a Mac user agent.
  ipadosMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};

describe("parseUserAgent rules", () => {
  it.each([
    ["iPhone Safari", UA.iphone, "mobile", "Safari", "iOS"],
    ["Android Chrome", UA.androidChrome, "mobile", "Chrome", "Android"],
    ["Android tablet", UA.androidTablet, "tablet", "Chrome", "Android"],
    ["iPad", UA.ipad, "tablet", "Safari", "iOS"],
    ["Windows Chrome", UA.winChrome, "desktop", "Chrome", "Windows"],
    ["Windows Edge", UA.winEdge, "desktop", "Edge", "Windows"],
    ["macOS Safari", UA.macSafari, "desktop", "Safari", "macOS"],
    ["Linux Firefox", UA.linuxFirefox, "desktop", "Firefox", "Linux"],
    ["Samsung Internet", UA.samsung, "mobile", "Samsung Internet", "Android"],
    ["Opera", UA.opera, "desktop", "Opera", "Windows"],
  ])("%s", (_n, ua, deviceType, browser, os) => {
    expect(parseUserAgent(ua)).toEqual({ deviceType, browser, os });
  });

  it.each([
    ["Googlebot", UA.googlebot],
    ["facebookexternalhit", UA.facebook],
    ["Slackbot", UA.slackbot],
    ["curl", UA.curl],
  ])("%s is a bot with no browser", (_n, ua) => {
    const r = parseUserAgent(ua);
    expect(r.deviceType).toBe("bot");
    expect(r.browser).toBeNull();
  });

  it.each([null, ""])("%j is unknown", (ua) => {
    expect(parseUserAgent(ua)).toEqual({
      deviceType: "unknown",
      browser: null,
      os: null,
    });
  });

  it("known limit: iPadOS Safari looks like a Mac, so it is desktop", () => {
    expect(parseUserAgent(UA.ipadosMac).deviceType).toBe("desktop");
  });
});
