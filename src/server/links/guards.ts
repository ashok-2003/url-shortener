import "server-only";
import { TRPCError } from "@trpc/server";
import { InputFieldError } from "@/server/trpc/errors";

/** Hostname with one trailing dot dropped, so "sho.rt." and "sho.rt" compare equal. */
function normalizedHostname(u: URL): string {
  return u.hostname.replace(/\.$/, "");
}

/** Rejects a target that points back at this app, which would loop. */
export function assertNotOwnHost(url: string, baseUrl: string): void {
  const target = new URL(url);
  const self = new URL(baseUrl);
  const sameHost =
    normalizedHostname(target) === normalizedHostname(self) && target.port === self.port;
  if (sameHost) {
    const message = "That's already a short link from this app";
    throw new TRPCError({
      code: "BAD_REQUEST",
      message,
      cause: new InputFieldError("url", message),
    });
  }
}
