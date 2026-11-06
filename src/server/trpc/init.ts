import "server-only";
import { initTRPC } from "@trpc/server";
import { formatError } from "./error-format";
import type { Context } from "./context";

// isDev is always false so stack traces never reach a client.
const t = initTRPC.context<Context>().create({
  errorFormatter: formatError,
  isDev: false,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;
