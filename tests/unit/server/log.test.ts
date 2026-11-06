import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "@/server/log";

afterEach(() => vi.restoreAllMocks());

describe("log", () => {
  it("log.error writes one JSON line with event, level and the error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("kv.read_failed", { slug: "aZ09xYz", error: new Error("boom") });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0]);
    expect(line).toMatchObject({
      level: "error",
      event: "kv.read_failed",
      slug: "aZ09xYz",
      error: { name: "Error", message: "boom" },
    });
    expect(typeof line.error.stack).toBe("string");
    expect(typeof line.time).toBe("string");
  });

  it("log.error copes with a non-Error value", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("x", { error: "plain" });
    expect(JSON.parse(spy.mock.calls[0][0]).error).toMatchObject({
      message: "plain",
    });
  });

  it("log.warn uses console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("kv.fill_failed", { slug: "a" });
    expect(JSON.parse(spy.mock.calls[0][0])).toMatchObject({
      level: "warn",
      event: "kv.fill_failed",
      slug: "a",
    });
  });

  it("log.info uses console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("hello");
    expect(JSON.parse(spy.mock.calls[0][0])).toMatchObject({
      level: "info",
      event: "hello",
    });
  });
});
