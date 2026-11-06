import { env } from "cloudflare:test";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Db } from "@/server/db/client";
import { createContext } from "@/server/trpc/context";
import { createCallerFactory } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/router";
import { testDb } from "./db";

export const BASE_URL = "https://sho.rt";

const createCaller = createCallerFactory(appRouter);
export type Caller = ReturnType<typeof createCaller>;

type CallerOptions = { ownerId?: string; db?: Db };

function contextFor(o: CallerOptions) {
  return createContext({
    db: o.db ?? testDb(),
    env,
    baseUrl: BASE_URL,
    ownerId: o.ownerId,
  });
}

/** An in-process caller for the real router, with `user_demo` by default. */
export function callerFor(o: CallerOptions = {}): Caller {
  return createCaller(contextFor(o));
}

export type TrpcBody = {
  result?: { data: unknown };
  error?: {
    message: string;
    data: {
      code: string;
      httpStatus: number;
      fieldErrors: Record<string, string[]> | null;
      retryAfterSeconds: number | null;
    };
  };
};

/**
 * Calls a procedure over HTTP through tRPC's fetch adapter, so the formatted
 * error shape the UI sees is what gets asserted.
 */
export async function trpcHttp(
  method: "GET" | "POST",
  path: string,
  input: unknown,
  o: CallerOptions = {},
): Promise<{ status: number; body: TrpcBody }> {
  const encoded = encodeURIComponent(JSON.stringify(input));
  const req =
    method === "GET"
      ? new Request(`${BASE_URL}/api/trpc/${path}?input=${encoded}`)
      : new Request(`${BASE_URL}/api/trpc/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => contextFor(o),
  });
  return { status: res.status, body: (await res.json()) as TrpcBody };
}
