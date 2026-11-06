/** `analytics.overview` output: totals and charts across all of the user's links (addendum section 4). */
export type AnalyticsOverview = {
  totals: {
    clicks: number;
    last24h: number;
    last7d: number;
    links: number;
    activeLinks: number;
  };
  /** Last 30 UTC days, oldest first, zero-filled. */
  daily: { date: string; clicks: number }[];
  /** Top 5 by all-time clicks. */
  topLinks: { slug: string; shortUrl: string; targetUrl: string; clicks: number }[];
  referrers: { host: string | null; clicks: number }[];
  countries: { country: string | null; clicks: number }[];
  devices: { deviceType: string; clicks: number }[];
};
