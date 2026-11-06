import "server-only";
import { TRPCError } from "@trpc/server";
import { RATE_LIMIT } from "@/server/config";
import { log } from "@/server/log";
import { RateLimitedError } from "@/server/trpc/errors";
import { middleware } from "@/server/trpc/init";
import { d1RateLimiter } from "./rate-limiter";

/**
 * The create rate limit (spec section 9, decision 0010). It runs after input validation and the
 * own-host guard, so those rejections never reach it. It takes a slot before the create and gives
 * it back if the create fails, so only successful creates count.
 */
export const rateLimitCreate = middleware(async ({ ctx, next }) => {
  const limiter = d1RateLimiter(ctx.env.DB);
  const acquired = await limiter.acquire(ctx.ownerId, Date.now());

  if (!acquired.ok) {
    log.info("ratelimit.limited", {
      ownerId: ctx.ownerId,
      retryAfterSeconds: acquired.retryAfterSeconds,
    });
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `You've made ${RATE_LIMIT.createsPerWindow} links in the last minute.`,
      cause: new RateLimitedError(acquired.retryAfterSeconds),
    });
  }

  const result = await next();
  if (!result.ok) {
    try {
      await limiter.release(acquired.slotId);
    } catch (error) {
      // Never mask the create's own error; the stale slot expires with the window.
      log.error("ratelimit.release_failed", { slotId: acquired.slotId, error });
    }
  }
  return result;
});
