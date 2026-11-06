"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}

/**
 * The current time at minute resolution, or null on the server and in the
 * first client render. Re-renders when the minute changes.
 */
export function useNow(): Date | null {
  const minute = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / MINUTE),
    () => null,
  );
  return minute === null ? null : new Date(minute * MINUTE);
}
