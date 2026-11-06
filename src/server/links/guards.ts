import "server-only";
import { TRPCError } from "@trpc/server";
import { InputFieldError } from "@/server/trpc/errors";

/** Rejects a target that points back at this app, which would loop. */
export function assertNotOwnHost(url: string, baseUrl: string): void {
  if (new URL(url).host === new URL(baseUrl).host) {
    const message = "That's already a short link from this app";
    throw new TRPCError({
      code: "BAD_REQUEST",
      message,
      cause: new InputFieldError("url", message),
    });
  }
}
