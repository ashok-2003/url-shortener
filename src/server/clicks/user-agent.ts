// No "server-only" guard: worker.ts's queue consumer imports this outside the Next.js react-server graph.
import type { DeviceType } from "./types";

const BOT =
  /bot|crawl|spider|slurp|facebookexternalhit|slackbot|twitterbot|whatsapp|discordbot|telegrambot|linkedinbot|embedly|preview|headless|curl|wget|python-requests/;
const TABLET = /ipad|tablet|kindle|silk|playbook/;
const MOBILE = /mobi|iphone|ipod|android|windows phone/;
const DESKTOP = /windows nt|macintosh|x11|cros|linux/;

export type ParsedUserAgent = {
  deviceType: DeviceType;
  browser: string | null;
  os: string | null;
};

function deviceTypeOf(ua: string): DeviceType {
  if (BOT.test(ua)) return "bot";
  if (TABLET.test(ua) || (ua.includes("android") && !ua.includes("mobile"))) {
    return "tablet";
  }
  if (MOBILE.test(ua)) return "mobile";
  if (DESKTOP.test(ua)) return "desktop";
  return "unknown";
}

// Order matters: Edge and Opera also say "Chrome" and "Safari", and Chrome
// also says "Safari".
function browserOf(ua: string): string | null {
  if (ua.includes("edg/")) return "Edge";
  if (/opr\/|opera/.test(ua)) return "Opera";
  if (ua.includes("samsungbrowser")) return "Samsung Internet";
  if (/firefox|fxios/.test(ua)) return "Firefox";
  if (/chrome|crios/.test(ua)) return "Chrome";
  if (ua.includes("safari")) return "Safari";
  return null;
}

// Order matters: iPhone says "like Mac OS X", Android says "Linux".
function osOf(ua: string): string | null {
  if (/iphone|ipad|ipod/.test(ua)) return "iOS";
  if (ua.includes("android")) return "Android";
  if (ua.includes("windows")) return "Windows";
  if (/mac os x|macintosh/.test(ua)) return "macOS";
  if (ua.includes("cros")) return "ChromeOS";
  if (ua.includes("linux")) return "Linux";
  return null;
}

/** Hand-written and small on purpose. iPadOS Safari reads as desktop. */
export function parseUserAgent(ua: string | null): ParsedUserAgent {
  if (!ua) return { deviceType: "unknown", browser: null, os: null };
  const lower = ua.toLowerCase();
  const deviceType = deviceTypeOf(lower);
  return {
    deviceType,
    browser: deviceType === "bot" ? null : browserOf(lower),
    os: osOf(lower),
  };
}
