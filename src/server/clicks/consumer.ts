import "server-only";
import { readEnv } from "@/server/config";
import { getDb } from "@/server/db/client";
import { log } from "@/server/log";
import { recordClicks } from "./record";
import type { ClickEvent, ClickMessage } from "./types";
import { parseUserAgent } from "./user-agent";

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isClickMessage(value: unknown): value is ClickMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clickId === "string" &&
    v.clickId.length > 0 &&
    typeof v.linkId === "number" &&
    Number.isInteger(v.linkId) &&
    typeof v.clickedAt === "number" &&
    Number.isFinite(v.clickedAt) &&
    isNullableString(v.referrerHost) &&
    isNullableString(v.country) &&
    isNullableString(v.userAgent)
  );
}

export function toClickEvent(message: ClickMessage): ClickEvent {
  return {
    id: message.clickId,
    linkId: message.linkId,
    clickedAt: message.clickedAt,
    referrer: message.referrerHost,
    country: message.country,
    ...parseUserAgent(message.userAgent),
  };
}

/**
 * Queue consumer. Malformed messages are retried (never acked) so they end up
 * in the dead-letter queue. If the write fails the error is rethrown so Queues
 * redelivers the whole batch; `recordClicks` is safe to replay.
 */
export async function handleClickBatch(
  batch: MessageBatch<unknown>,
  env: CloudflareEnv,
): Promise<void> {
  const appEnv = readEnv(env);
  const events: ClickEvent[] = [];
  for (const message of batch.messages) {
    if (isClickMessage(message.body)) {
      events.push(toClickEvent(message.body));
    } else {
      log.error("click.bad_message", { messageId: message.id, attempts: message.attempts });
      message.retry();
    }
  }
  try {
    await recordClicks(getDb(appEnv.db), events);
  } catch (error) {
    log.error("click.record_failed", { batchSize: batch.messages.length, error });
    throw error;
  }
}
