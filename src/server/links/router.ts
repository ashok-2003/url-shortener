import "server-only";
import {
  createLinkInput,
  linkStatsInput,
  listLinksInput,
} from "@/features/links/schema";
import { publicProcedure, router } from "@/server/trpc/init";
import { assertNotOwnHost } from "./guards";
import { createFixtureLink, fixtureList, fixtureStats } from "./fixtures";
import { rateLimitCreate } from "./rate-limit";

export const linksRouter = router({
  create: publicProcedure
    .input(createLinkInput)
    .use(({ ctx, input, next }) => {
      assertNotOwnHost(input.url, ctx.baseUrl);
      return next();
    })
    .use(rateLimitCreate)
    .mutation(({ ctx, input }) => createFixtureLink(ctx, input, new Date())),

  list: publicProcedure
    .input(listLinksInput)
    .query(({ ctx, input }) => fixtureList(ctx.baseUrl, input, new Date())),

  stats: publicProcedure
    .input(linkStatsInput)
    .query(({ ctx, input }) =>
      fixtureStats(ctx.baseUrl, input.slug, new Date()),
    ),
});
