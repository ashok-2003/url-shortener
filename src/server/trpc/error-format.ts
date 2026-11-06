import "server-only";
import type { TRPCDefaultErrorShape } from "@trpc/server";
import type { TRPCError } from "@trpc/server";
import { ZodError, z } from "zod";
import { InputFieldError, RateLimitedError } from "./errors";

const INTERNAL_MESSAGE = "Something went wrong on our side.";

function fieldErrorsOf(error: TRPCError): Record<string, string[]> | null {
  const cause = error.cause;
  if (cause instanceof ZodError) {
    return z.flattenError(cause).fieldErrors as Record<string, string[]>;
  }
  if (cause instanceof InputFieldError) {
    return { [cause.field]: [cause.message] };
  }
  return null;
}

export function formatError({
  shape,
  error,
}: {
  shape: TRPCDefaultErrorShape;
  error: TRPCError;
}) {
  const retryAfterSeconds =
    error.cause instanceof RateLimitedError
      ? error.cause.retryAfterSeconds
      : null;
  return {
    ...shape,
    // An unexpected Error would otherwise echo its own message to the client.
    message:
      error.code === "INTERNAL_SERVER_ERROR" ? INTERNAL_MESSAGE : shape.message,
    data: {
      ...shape.data,
      fieldErrors: fieldErrorsOf(error),
      retryAfterSeconds,
    },
  };
}
