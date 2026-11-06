import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { describeCreateError } from "@/features/links/create-error";

function trpcError(data?: Record<string, unknown>) {
  return new TRPCClientError("boom", {
    result: data ? ({ error: { message: "boom", code: -1, data } } as never) : undefined,
  });
}

describe("describeCreateError", () => {
  it("maps rate limiting with a retry time", () => {
    const e = trpcError({ code: "TOO_MANY_REQUESTS", httpStatus: 429, retryAfterSeconds: 42 });
    expect(describeCreateError(e)).toEqual({ kind: "rate-limited", retryAfterSeconds: 42 });
  });
  it("maps rate limiting without a retry time", () => {
    const e = trpcError({ code: "TOO_MANY_REQUESTS", httpStatus: 429, retryAfterSeconds: null });
    expect(describeCreateError(e)).toEqual({ kind: "rate-limited", retryAfterSeconds: null });
  });
  it("maps validation errors", () => {
    const fieldErrors = { url: ["Only https links are allowed."] };
    const e = trpcError({ code: "BAD_REQUEST", httpStatus: 400, fieldErrors });
    expect(describeCreateError(e)).toEqual({ kind: "invalid", fieldErrors });
  });
  it("maps a fetch failure to network", () => {
    expect(describeCreateError(trpcError())).toEqual({ kind: "network" });
  });
  it("maps internal errors to server", () => {
    const e = trpcError({ code: "INTERNAL_SERVER_ERROR", httpStatus: 500 });
    expect(describeCreateError(e)).toEqual({ kind: "server" });
  });
  it("maps plain errors to server", () => {
    expect(describeCreateError(new Error("x"))).toEqual({ kind: "server" });
  });
});
