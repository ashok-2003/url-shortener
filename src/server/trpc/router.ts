import "server-only";
import { analyticsRouter } from "@/server/analytics/router";
import { linksRouter } from "@/server/links/router";
import { router } from "./init";

export const appRouter = router({ links: linksRouter, analytics: analyticsRouter });
export type AppRouter = typeof appRouter;
