import { z } from "zod";

export const SLUG_LENGTH = 7;
export const SLUG_PATTERN = new RegExp(`^[A-Za-z0-9]{${SLUG_LENGTH}}$`);
export const MAX_URL_LENGTH = 2048;

export const EXPIRY_PRESETS = ["1h", "24h", "7d", "30d"] as const;
export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number];

export const PRESET_DURATION_MS: Record<ExpiryPreset, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

export const CUSTOM_EXPIRY_MIN_MS = 5 * 60_000;
export const CUSTOM_EXPIRY_MAX_MS = 365 * 86_400_000;

export const urlSchema = z.string().trim().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (value === "") return fail("Paste a link to shorten");
  if (value.length > MAX_URL_LENGTH) {
    return fail(`Links can be at most ${MAX_URL_LENGTH} characters`);
  }
  if (!URL.canParse(value)) {
    return fail("Enter a full link, starting with https://");
  }
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") return fail("Use an https:// link");
  if (parsed.username !== "" || parsed.password !== "") {
    return fail("Links with a username or password aren't allowed");
  }
});

const customExpirySchema = z
  .object({ kind: z.literal("custom"), at: z.string() })
  .superRefine((value, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: "custom", message, path: ["at"] });
    const at = Date.parse(value.at);
    if (Number.isNaN(at)) return fail("Pick a valid date and time");
    // Checked against the clock of whoever parses: the client's in the form,
    // the server's in the procedure (spec section 8).
    const delta = at - Date.now();
    if (delta < CUSTOM_EXPIRY_MIN_MS) {
      return fail("Pick a time at least 5 minutes from now");
    }
    if (delta > CUSTOM_EXPIRY_MAX_MS) return fail("Pick a date within a year");
  });

export const expirySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("never") }),
  z.object({ kind: z.literal("preset"), preset: z.enum(EXPIRY_PRESETS) }),
  customExpirySchema,
]);
export type ExpiryInput = z.infer<typeof expirySchema>;

export const createLinkInput = z.object({
  url: urlSchema,
  expiry: expirySchema.default({ kind: "never" }),
});

export const listLinksInput = z.object({
  cursor: z.number().int().positive().nullish(),
  limit: z.number().int().min(1).max(50).default(20),
  /** My links search: matches the slug or the target URL, case-insensitively. Empty means no filter. */
  q: z.string().trim().max(200).optional(),
});

export const linkStatsInput = z.object({
  slug: z.string().regex(SLUG_PATTERN),
});

export type LinkSummary = {
  slug: string;
  shortUrl: string;
  targetUrl: string;
  clicks: number;
  createdAt: string; // ISO
  expiresAt: string | null; // ISO; null = never
  isExpired: boolean; // computed on the server when the response is made
};

export type ListLinksOutput = {
  items: LinkSummary[];
  nextCursor: number | null;
};

export type LinkStats = {
  link: LinkSummary;
  lastClickAt: string | null;
  totals: { all: number; last24h: number; last7d: number };
  daily: { date: string; clicks: number }[]; // last 30 UTC days, zero-filled
  referrers: { host: string | null; clicks: number }[]; // top 5; null = direct
  countries: { country: string | null; clicks: number }[]; // top 5
  devices: { deviceType: string; clicks: number }[];
};
