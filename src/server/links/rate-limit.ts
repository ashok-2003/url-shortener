import "server-only";
import { middleware } from "@/server/trpc/init";

/**
 * The owner's seam (spec section 9). A full middleware: it may act before and
 * after `await next()`. Until the owner builds it, it passes everything through.
 */
export const rateLimitCreate = middleware(({ next }) => next());
