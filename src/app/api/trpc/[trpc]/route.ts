import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { log } from "@/server/log";
import { createRequestContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/router";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createRequestContext(req),
    onError: ({ error, path }) =>
      log.error("trpc.error", { path, code: error.code, error }),
  });
}

export { handler as GET, handler as POST };
