import "server-only";

export type DeviceType = "mobile" | "tablet" | "desktop" | "bot" | "unknown";

/** What the redirect handler puts on the queue. */
export type ClickMessage = {
  clickId: string;
  linkId: number;
  clickedAt: number;
  referrerHost: string | null;
  country: string | null;
  userAgent: string | null;
};

/** A click after the user agent is parsed, ready to be stored. */
export type ClickEvent = {
  id: string;
  linkId: number;
  clickedAt: number;
  referrer: string | null;
  country: string | null;
  deviceType: DeviceType;
  browser: string | null;
  os: string | null;
};
