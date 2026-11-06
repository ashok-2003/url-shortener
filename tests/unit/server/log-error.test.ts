import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logTrpcError } from "@/server/trpc/log-error";

afterEach(() => vi.restoreAllMocks());

function spies() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

describe("logTrpcError", () => {
  it("logs TOO_MANY_REQUESTS at warn without a stack", () => {
    const { warn, error } = spies();
    logTrpcError({
      error: new TRPCError({ code: "TOO_MANY_REQUESTS", message: "slow down" }),
      path: "link.create",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warn.mock.calls[0][0]);
    expect(line).toMatchObject({
      level: "warn",
      event: "trpc.client_error",
      path: "link.create",
      code: "TOO_MANY_REQUESTS",
      status: 429,
      message: "slow down",
    });
    expect(line).not.toHaveProperty("error");
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ["BAD_REQUEST", 400],
    ["NOT_FOUND", 404],
  ] as const)("logs %s at warn with status %i", (code, status) => {
    const { warn, error } = spies();
    logTrpcError({ error: new TRPCError({ code }), path: "x" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
      event: "trpc.client_error",
      status,
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("logs INTERNAL_SERVER_ERROR at error with the full error", () => {
    const { warn, error } = spies();
    logTrpcError({
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new Error("db exploded"),
      }),
      path: "link.create",
    });
    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.parse(error.mock.calls[0][0]);
    expect(line).toMatchObject({
      level: "error",
      event: "trpc.error",
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
    });
    expect(typeof line.error.message).toBe("string");
    expect(typeof line.error.stack).toBe("string");
    expect(warn).not.toHaveBeenCalled();
  });
});
