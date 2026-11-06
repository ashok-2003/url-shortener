import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { getDb, type Db } from "@/server/db/client";

export const DEMO_USER_ID = "user_demo";

export type Context = {
  ownerId: string;
  db: Db;
  baseUrl: string;
  env: CloudflareEnv;
};

export function createContext(opts: {
  db: Db;
  env: CloudflareEnv;
  baseUrl: string;
  ownerId?: string;
}): Context {
  return {
    ownerId: opts.ownerId ?? DEMO_USER_ID,
    db: opts.db,
    env: opts.env,
    baseUrl: opts.baseUrl,
  };
}

export function resolveBaseUrl(origin: string, publicBaseUrl?: string): string {
  const base =
    typeof publicBaseUrl === "string" && publicBaseUrl !== ""
      ? publicBaseUrl
      : origin;
  return base.replace(/\/+$/, "");
}

/** Context for the HTTP adapter (`/api/trpc`). */
export function createRequestContext(req: Request): Context {
  const { env } = getCloudflareContext();
  return createContext({
    db: getDb(env.DB),
    env,
    baseUrl: resolveBaseUrl(new URL(req.url).origin, env.PUBLIC_BASE_URL),
  });
}

/** Context for in-process calls from React Server Components. */
export async function createRscContext(): Promise<Context> {
  const { env } = getCloudflareContext();
  const h = await headers();
  const host = h.get("host") ?? "localhost";
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return createContext({
    db: getDb(env.DB),
    env,
    baseUrl: resolveBaseUrl(`${proto}://${host}`, env.PUBLIC_BASE_URL),
  });
}
