import { describe, expect, it } from "vitest";
import { parseUserAgent } from "@/server/clicks/user-agent";

const cases: [string, string, string][] = [
  [
    "iPhone Safari",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "mobile",
  ],
  [
    "Android phone Chrome",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    "mobile",
  ],
  [
    "Android tablet Chrome",
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "tablet",
  ],
  [
    "Windows Chrome",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "desktop",
  ],
  [
    "Linux Firefox",
    "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "desktop",
  ],
  [
    "Mac Safari",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "desktop",
  ],
  [
    // iPadOS reports a Mac UA; a known limit.
    "iPadOS Safari",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "desktop",
  ],
  [
    "Googlebot",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "bot",
  ],
  [
    "facebookexternalhit",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "bot",
  ],
  [
    "Slackbot-LinkExpanding",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "bot",
  ],
  ["Twitterbot", "Twitterbot/1.0", "bot"],
];

describe("parseUserAgent", () => {
  it.each(cases)("%s -> %s", (_name, ua, deviceType) => {
    expect(parseUserAgent(ua).deviceType).toBe(deviceType);
  });

  it.each([
    ["empty string", ""],
    ["null", null],
  ] as const)("%s is unknown with null browser and os", (_name, ua) => {
    expect(parseUserAgent(ua)).toEqual({
      deviceType: "unknown",
      browser: null,
      os: null,
    });
  });
});
