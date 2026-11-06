import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createRequestContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/router";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createRequestContext(req),
  });
}

export { handler as GET, handler as POST };
