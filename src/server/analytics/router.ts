import "server-only";
import { publicProcedure, router } from "@/server/trpc/init";
import { fixtureOverview } from "./fixtures";

export const analyticsRouter = router({
  // TEMP: workstream C replaces the body with SQL aggregates for ctx.ownerId; the output type stays.
  overview: publicProcedure.query(({ ctx }) => fixtureOverview(ctx.baseUrl, new Date())),
});
