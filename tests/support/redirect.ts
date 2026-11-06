import { env } from "cloudflare:test";
import { resolveRedirect } from "@/server/redirect/resolve";
import { BASE_URL } from "./trpc";

type RedirectOptions = {
  method?: "GET" | "HEAD";
  headers?: HeadersInit;
  cf?: { country?: string | null } | null;
  env?: CloudflareEnv;
};

/**
 * Calls `resolveRedirect` for `https://sho.rt<path>`. `settle()` waits for
 * everything the redirect handed to `waitUntil` (KV fill, click enqueue).
 */
export async function runRedirect(path: string, o: RedirectOptions = {}) {
  const pending: Promise<unknown>[] = [];
  const response = await resolveRedirect({
    request: new Request(`${BASE_URL}${path}`, {
      method: o.method ?? "GET",
      headers: o.headers,
    }),
    env: o.env ?? env,
    waitUntil: (p) => {
      pending.push(p);
    },
    cf: o.cf,
  });
  return {
    response,
    settle: async () => {
      while (pending.length > 0) await Promise.all(pending.splice(0));
    },
  };
}

/** Wraps the storage bindings and counts every property access on them. */
export function countingEnv(base: CloudflareEnv = env) {
  let touches = 0;
  const watch = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(t, prop) {
        touches++;
        const value = (t as Record<PropertyKey, unknown>)[prop];
        return typeof value === "function" ? value.bind(t) : value;
      },
    });
  return {
    env: {
      ...base,
      DB: watch(base.DB),
      LINKS_CACHE: watch(base.LINKS_CACHE),
      CLICKS: watch(base.CLICKS),
    } as CloudflareEnv,
    touches: () => touches,
  };
}

/**
 * Replaces `CLICKS` with a recorder. "real" records each message and forwards
 * it to the real queue; "hang" records it and never settles.
 */
export function capturingQueue(
  mode: "real" | "hang",
  base: CloudflareEnv = env,
) {
  const sent: unknown[] = [];
  const CLICKS = {
    send(message: unknown, options?: QueueSendOptions): Promise<unknown> {
      sent.push(message);
      return mode === "real"
        ? base.CLICKS.send(message, options)
        : new Promise<never>(() => {});
    },
  } as unknown as CloudflareEnv["CLICKS"];
  return { env: { ...base, CLICKS } as CloudflareEnv, sent };
}
