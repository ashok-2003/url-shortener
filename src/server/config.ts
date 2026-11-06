import "server-only";

/** Server-side tunables. Contract values the browser also needs live in `features/links/schema.ts`. */
export const REDIRECT = {
  cacheKeyPrefix: "link:",
  cacheMaxTtlSeconds: 604_800,
  cacheMinTtlSeconds: 60,
  retryAfterSeconds: 5,
  maxUserAgentLength: 512,
} as const;

export const LINKS = {
  maxSlugAttempts: 3,
  statsDays: 30,
  statsTopN: 5,
} as const;

/** Create rate limit (decision 0010): at most `createsPerWindow` successful creates per owner in any `windowMs`. */
export const RATE_LIMIT = {
  createsPerWindow: 5,
  windowMs: 60_000,
} as const;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type AppEnv = {
  db: D1Database;
  linksCache: KVNamespace;
  clicks: Queue;
  /** `null` means "use the request origin". */
  publicBaseUrl: string | null;
};

function requireBinding<T>(
  env: CloudflareEnv,
  name: "DB" | "LINKS_CACHE" | "CLICKS",
): T {
  const value = (env as unknown as Record<string, unknown>)[name];
  if (value === undefined || value === null) {
    throw new ConfigError(
      `Missing Cloudflare binding ${name}. Declare it in wrangler.jsonc and run \`pnpm cf-typegen\`.`,
    );
  }
  return value as T;
}

function readPublicBaseUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const bad = () =>
    new ConfigError(
      `PUBLIC_BASE_URL must be empty or an http(s) URL such as https://sho.rt, got ${JSON.stringify(raw)}. Fix it under "vars" in wrangler.jsonc.`,
    );
  if (typeof raw !== "string") throw bad();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw bad();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw bad();
  return raw;
}

/** Validates every binding and variable. Call it first in every entry point. */
export function readEnv(env: CloudflareEnv): AppEnv {
  return {
    db: requireBinding<D1Database>(env, "DB"),
    linksCache: requireBinding<KVNamespace>(env, "LINKS_CACHE"),
    clicks: requireBinding<Queue>(env, "CLICKS"),
    publicBaseUrl: readPublicBaseUrl(env.PUBLIC_BASE_URL),
  };
}
