import "server-only";
import { publicProcedure, router } from "@/server/trpc/init";
import { analyticsOverview } from "./service";

export const analyticsRouter = router({
  overview: publicProcedure.query(({ ctx }) => analyticsOverview(ctx)),
});
