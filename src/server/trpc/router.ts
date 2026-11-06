import "server-only";
import { linksRouter } from "@/server/links/router";
import { router } from "./init";

export const appRouter = router({ links: linksRouter });
export type AppRouter = typeof appRouter;
