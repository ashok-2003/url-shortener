import { vi } from "vitest";

/** A fake queue batch whose messages carry spy `ack`/`retry` and the given bodies. */
export function fakeBatch(bodies: unknown[]) {
  const messages = bodies.map((body, i) => ({
    id: `m${i}`,
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  const batch = { queue: "clicks", messages, ackAll: vi.fn(), retryAll: vi.fn() };
  return { batch: batch as unknown as MessageBatch<unknown>, messages };
}
