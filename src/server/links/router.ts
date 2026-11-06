import "server-only";
import {
  createLinkInput,
  linkStatsInput,
  listLinksInput,
} from "@/features/links/schema";
import { publicProcedure, router } from "@/server/trpc/init";
import { assertNotOwnHost } from "./guards";
import { createLink, linkStats, listLinks } from "./service";
import { rateLimitCreate } from "./rate-limit";

export const linksRouter = router({
  create: publicProcedure
    .input(createLinkInput)
    .use(({ ctx, input, next }) => {
      assertNotOwnHost(input.url, ctx.baseUrl);
      return next();
    })
    .use(rateLimitCreate)
    .mutation(({ ctx, input }) => createLink(ctx, input)),

  list: publicProcedure
    .input(listLinksInput)
    .query(({ ctx, input }) => listLinks(ctx, input)),

  stats: publicProcedure
    .input(linkStatsInput)
    .query(({ ctx, input }) => linkStats(ctx, input.slug)),
});
