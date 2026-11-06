import {
  CUSTOM_EXPIRY_MAX_MS,
  CUSTOM_EXPIRY_MIN_MS,
  type ExpiryInput,
  type ExpiryPreset,
} from "@/features/links/schema";

export type ExpiryChoice = "never" | ExpiryPreset | "custom";

/**
 * Maps the chip selection to the API's expiry input. `customLocal` is a
 * `datetime-local` value (local time, no zone). An empty or unparseable value
 * is passed through as-is so the schema reports "Pick a valid date and time".
 */
export function toExpiryInput(
  choice: ExpiryChoice,
  customLocal: string,
): ExpiryInput {
  if (choice === "never") return { kind: "never" };
  if (choice === "custom") {
    const at = new Date(customLocal);
    return {
      kind: "custom",
      at: Number.isNaN(at.getTime()) ? "" : at.toISOString(),
    };
  }
  return { kind: "preset", preset: choice };
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** `datetime-local` min and max: now + 5 minutes and now + 365 days, in local time. */
export function customBounds(now: Date): { min: string; max: string } {
  return {
    min: toLocalInputValue(new Date(now.getTime() + CUSTOM_EXPIRY_MIN_MS)),
    max: toLocalInputValue(new Date(now.getTime() + CUSTOM_EXPIRY_MAX_MS)),
  };
}
