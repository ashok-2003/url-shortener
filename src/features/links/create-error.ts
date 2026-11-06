import { TRPCClientError } from "@trpc/client";

export type CreateErrorView =
  | { kind: "rate-limited"; retryAfterSeconds: number | null }
  | { kind: "invalid"; fieldErrors: Partial<Record<"url" | "expiry", string[]>> }
  | { kind: "network" }
  | { kind: "server" };

type ErrorData = {
  code?: string;
  httpStatus?: number;
  fieldErrors?: Partial<Record<"url" | "expiry", string[]>>;
  retryAfterSeconds?: number | null;
};

export function describeCreateError(error: unknown): CreateErrorView {
  if (!(error instanceof TRPCClientError)) return { kind: "server" };
  const data = (error.data ?? null) as ErrorData | null;
  if (!data) return { kind: "network" };
  if (data.code === "TOO_MANY_REQUESTS") {
    return {
      kind: "rate-limited",
      retryAfterSeconds:
        typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : null,
    };
  }
  if (data.code === "BAD_REQUEST" && data.fieldErrors) {
    return { kind: "invalid", fieldErrors: data.fieldErrors };
  }
  return { kind: "server" };
}

export function rateLimitMessage(secondsLeft: number | null): string {
  const base = "You've made 5 links in the last minute.";
  return secondsLeft === null
    ? `${base} Try again in a minute.`
    : `${base} Try again in ${secondsLeft} s`;
}

export function secondsLeft(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
