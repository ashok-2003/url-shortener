import "server-only";
import type { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { log } from "@/server/log";

/**
 * Expected client errors (HTTP status below 500) are warnings without a stack;
 * everything else is a real failure and is logged in full at `error`.
 */
export function logTrpcError({
  error,
  path,
}: {
  error: TRPCError;
  path: string | undefined;
}): void {
  const status = getHTTPStatusCodeFromError(error);
  if (status < 500) {
    log.warn("trpc.client_error", {
      path,
      code: error.code,
      status,
      message: error.message,
    });
    return;
  }
  log.error("trpc.error", { path, code: error.code, status, error });
}
